// CompassED: Microsoft 365 / Teams bridge (Supabase Edge Function "ce-teams").
//
// The page signs the user in to Microsoft itself (PKCE, see assets/ms.js) and sends the resulting tokens here.
// This function (1) verifies the Microsoft id token against Microsoft's published signing keys, (2) checks the
// caller's CompassED identity through the same database functions the site uses, (3) calls Microsoft Graph with
// the caller's own delegated access token, and (4) writes the results with the service-role key, which never
// leaves the server. Nothing here can be reached without a valid Compass Dash student or teacher identity.
//
// Secrets to set in Supabase (Edge Functions > Secrets):
//   MS_CLIENT_ID      Entra ID app registration > Application (client) ID   (same value as assets/config.js)
//   MS_TENANT_ID      the school's Directory (tenant) ID, or "organizations" for any school account
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.
// The client secret is NOT needed: every Graph call runs as the signed-in teacher (delegated permissions), which
// is what Teams for Education expects for assignments and roster reads.
//
// Graph permissions the admin must consent to (delegated): User.Read, Team.ReadBasic.All, EduRoster.ReadBasic,
// EduAssignments.ReadWrite, ChannelMessage.Send, Chat.Create, ChatMessage.Send.
//
// Deploy:  supabase functions deploy ce-teams --no-verify-jwt
import { createClient } from "npm:@supabase/supabase-js@2";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5";

const ORIGINS = ["https://compass-ed.github.io", "https://compassdash.github.io", "http://localhost:8766", "http://127.0.0.1:8766"];
const CLIENT_ID = Deno.env.get("MS_CLIENT_ID") ?? "";
const TENANT = Deno.env.get("MS_TENANT_ID") ?? "organizations";
const JWKS = createRemoteJWKSet(new URL("https://login.microsoftonline.com/common/discovery/v2.0/keys"));
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

type Json = Record<string, unknown>;
const cors = (origin: string) => ({
  "Access-Control-Allow-Origin": ORIGINS.includes(origin) ? origin : ORIGINS[0],
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
});
const reply = (origin: string, body: Json, status = 200) => new Response(JSON.stringify(body), { status, headers: cors(origin) });
const err = (origin: string, error: string, status = 400) => reply(origin, { ok: false, error }, status);

async function rpc(fn: string, args: Json): Promise<Json> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(error.message);
  return (data ?? {}) as Json;
}

/** Verify a Microsoft id token issued to our app. Returns the user's object id, tenant, name and email. */
async function verifyIdToken(idToken: string) {
  const { payload } = await jwtVerify(idToken, JWKS, { audience: CLIENT_ID });
  const iss = String(payload.iss ?? "");
  if (!/^https:\/\/login\.microsoftonline\.com\/[0-9a-f-]+\/v2\.0$/.test(iss)) throw new Error("bad_issuer");
  if (TENANT !== "organizations" && TENANT !== "common" && payload.tid !== TENANT) throw new Error("wrong_tenant");
  return { oid: String(payload.oid), tenant: String(payload.tid), name: String(payload.name ?? ""), email: String(payload.preferred_username ?? payload.email ?? "") };
}

async function graph(token: string, path: string, init: RequestInit = {}) {
  const r = await fetch("https://graph.microsoft.com/v1.0" + path, { ...init, headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", ...(init.headers ?? {}) } });
  const text = await r.text();
  let body: Json = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!r.ok) throw new Error("graph_" + r.status + ": " + ((body.error as Json)?.message ?? text));
  return body;
}

/** Who is calling? A teacher (p_key) or a student (p_code + p_user). */
async function identify(b: Json) {
  if (typeof b.p_key === "string" && b.p_key) {
    const t = await rpc("ce_t_me", { p_key: b.p_key });
    if (t.ok) return { role: "teacher" as const, t, key: b.p_key as string };
  }
  if (typeof b.p_code === "string" && typeof b.p_user === "string") {
    const s = await rpc("ce_s_login", { p_code: b.p_code, p_user: b.p_user });
    if (s.ok) return { role: "student" as const, s, code: b.p_code as string, user: b.p_user as string };
  }
  return null;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(origin) });
  if (req.method !== "POST") return err(origin, "method", 405);
  if (!CLIENT_ID) return err(origin, "MS_CLIENT_ID secret is not set", 500);
  let b: Json;
  try { b = await req.json(); } catch { return err(origin, "bad_json"); }
  const action = String(b.action ?? "");
  const msToken = typeof b.ms_token === "string" ? b.ms_token : "";

  try {
    // ---- sign in with Microsoft: who is this account linked to?
    if (action === "whoami") {
      const u = await verifyIdToken(String(b.id_token ?? ""));
      const who = await rpc("ce_ms_who", { p_oid: u.oid });
      if (!who.ok) return reply(origin, who);
      return reply(origin, who);
    }

    const me = await identify(b);
    if (!me) return err(origin, "bad_key", 401);

    // ---- link the signed-in CompassED user to this Microsoft account
    if (action === "link") {
      const u = await verifyIdToken(String(b.id_token ?? ""));
      const r = await rpc("ce_ms_link", { p_oid: u.oid, p_tenant: u.tenant, p_email: u.email, p_name: u.name, p_code: me.role === "student" ? me.code : null, p_user: me.role === "student" ? me.user : null, p_key: me.role === "teacher" ? me.key : null });
      return reply(origin, r);
    }

    if (me.role !== "teacher") return err(origin, "forbidden", 403);
    if (!msToken) return err(origin, "Sign in to Microsoft first.", 401);
    const key = me.key;

    // ---- list the teacher's class Teams
    if (action === "teams") {
      const r = await graph(msToken, "/education/me/classes?$select=id,displayName,classCode");
      const classes = ((r.value as Json[]) ?? []).map((c) => ({ id: String(c.id), name: String(c.displayName), code: c.classCode ?? "" }));
      return reply(origin, { ok: true, teams: classes });
    }

    // ---- link a CompassED class to a Team
    if (action === "link_class") {
      const r = await rpc("ce_ms_class_link", { p_key: key, p_class: Number(b.class_id), p_team: String(b.team_id ?? ""), p_name: String(b.team_name ?? "") });
      return reply(origin, r);
    }

    // helper: the Team linked to a class (and permission check through ce_t_class)
    const teamFor = async (classId: number) => {
      const chk = await rpc("ce_t_class", { p_key: key, p_class: classId });
      if (!chk.ok) throw new Error(String(chk.error));
      const { data } = await db.from("ce_ms_class").select("team_id").eq("class_id", classId).maybeSingle();
      if (!data) throw new Error("This class is not linked to a Team yet.");
      return String(data.team_id);
    };

    // ---- roster import: members of the class Team matched to Compass Dash accounts
    if (action === "roster") {
      const classId = Number(b.class_id); const team = await teamFor(classId);
      const r = await graph(msToken, `/education/classes/${team}/members?$select=id,displayName,mail,userPrincipalName`);
      const members = ((r.value as Json[]) ?? []).map((m) => ({ oid: String(m.id), name: String(m.displayName ?? ""), email: String(m.mail ?? m.userPrincipalName ?? ""), tenant: "" }));
      const out = await rpc("ce_ms_roster", { p_key: key, p_class: classId, p_members: members });
      return reply(origin, out);
    }

    // ---- post a message to the Team's General channel
    if (action === "notify") {
      const classId = Number(b.class_id); const team = await teamFor(classId);
      const ch = await graph(msToken, `/teams/${team}/primaryChannel?$select=id`);
      const text = String(b.text ?? "").slice(0, 2000);
      await graph(msToken, `/teams/${team}/channels/${ch.id}/messages`, { method: "POST", body: JSON.stringify({ body: { contentType: "html", content: `<b>CompassED</b><br>${escapeHtml(text)}` } }) });
      return reply(origin, { ok: true });
    }

    // ---- create the matching Teams assignment and publish it
    if (action === "push_assign") {
      const assignId = Number(b.assign_id);
      const subs = await rpc("ce_t_subs", { p_key: key, p_assign: assignId });
      if (!subs.ok) return reply(origin, subs);
      const a = subs.assign as Json; const team = await teamFor(Number(a.class_id));
      const siteUrl = ORIGINS[0] + "/app.html#/assignment/" + assignId;
      const created = await graph(msToken, `/education/classes/${team}/assignments`, { method: "POST", body: JSON.stringify({
        displayName: String(a.title), instructions: { contentType: "text", content: String(a.instr ?? "") + "\n\nOpen in CompassED: " + siteUrl },
        dueDateTime: a.due ? new Date(String(a.due)).toISOString() : null, allowStudentsToAddResourcesToSubmission: false,
        grading: { "@odata.type": "#microsoft.graph.educationAssignmentPointsGradeType", maxPoints: Number(a.points ?? 10) },
        assignTo: { "@odata.type": "#microsoft.graph.educationAssignmentClassRecipient" }, addedStudentAction: "none" }) });
      await graph(msToken, `/education/classes/${team}/assignments/${created.id}/publish`, { method: "POST" });
      await rpc("ce_ms_mark", { p_key: key, p_assign: assignId, p_teams_id: String(created.id), p_sub: null, p_ok: null });
      await graph(msToken, `/teams/${team}/primaryChannel?$select=id`).then((ch) => graph(msToken, `/teams/${team}/channels/${ch.id}/messages`, { method: "POST", body: JSON.stringify({ body: { contentType: "html", content: `<b>New ${a.kind}:</b> ${escapeHtml(String(a.title))}${a.due ? " · due " + new Date(String(a.due)).toLocaleDateString("en-GB") : ""}<br><a href="${siteUrl}">Open in CompassED</a>` } }) })).catch(() => {});
      return reply(origin, { ok: true, teams_id: created.id });
    }

    // ---- send returned marks to the Teams assignment (points out of the assignment's maxPoints)
    if (action === "push_grades") {
      const assignId = Number(b.assign_id);
      const subs = await rpc("ce_t_subs", { p_key: key, p_assign: assignId });
      if (!subs.ok) return reply(origin, subs);
      const a = subs.assign as Json; const team = await teamFor(Number(a.class_id));
      if (!a.teams_id) return err(origin, "Post the assignment to Teams first.");
      const { data: links } = await db.from("ce_ms_user").select("oid, sid").not("sid", "is", null);
      const oidOf = new Map((links ?? []).map((l) => [String(l.sid), String(l.oid)]));
      const tsubs = await graph(msToken, `/education/classes/${team}/assignments/${a.teams_id}/submissions?$expand=submittedBy`);
      const subOf = new Map(((tsubs.value as Json[]) ?? []).map((s) => [String(((s.submittedBy as Json)?.user as Json)?.id), String(s.id)]));
      let sent = 0; const skipped: string[] = [];
      for (const row of (subs.rows as Json[])) {
        const sub = row.sub as Json | null;
        if (!sub || sub.status !== "returned" || sub.teams_ok) continue;
        const oid = oidOf.get(String(row.sid)); const tsub = oid && subOf.get(oid);
        if (!tsub) { skipped.push(String(row.name)); continue; }
        const points = Math.round(Number(sub.score ?? 0) / 100 * Number(a.points ?? 10) * 100) / 100;
        await graph(msToken, `/education/classes/${team}/assignments/${a.teams_id}/submissions/${tsub}`, { method: "PATCH", body: JSON.stringify({ grade: { "@odata.type": "#microsoft.graph.educationAssignmentPointsGrade", points } }) });
        if (sub.feedback) await graph(msToken, `/education/classes/${team}/assignments/${a.teams_id}/submissions/${tsub}`, { method: "PATCH", body: JSON.stringify({ feedback: { text: { content: String(sub.feedback), contentType: "text" } } }) }).catch(() => {});
        await graph(msToken, `/education/classes/${team}/assignments/${a.teams_id}/submissions/${tsub}/return`, { method: "POST" }).catch(() => {});
        await rpc("ce_ms_mark", { p_key: key, p_assign: null, p_teams_id: null, p_sub: Number(sub.id), p_ok: true });
        sent++;
      }
      return reply(origin, { ok: true, sent, skipped });
    }

    return err(origin, "unknown_action", 404);
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    const status = /bad_key|forbidden|wrong_tenant|bad_issuer|JWT/i.test(m) ? 401 : 400;
    return err(origin, m, status);
  }
});

function escapeHtml(s: string) { return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)); }
