/**
 * The Veritag domain client (veritag-core) + the ArtTrust verdict policy.
 *
 * Two layers:
 *  - `VeritagApi` — curators, artists, the blue-check handshake, exhibitions and
 *    the visitor passport, over the domain API (https://api.veritag.art).
 *  - the binding helpers (`veritagBinding`, `verdictOf`) — kept byte-identical
 *    to the Python backend + Flutter app and pinned by test/portal.test.mjs.
 *
 * No private key is ever created or held here — artists sign on their device.
 */
import { type VerifyResult } from "@veritag/sdk";

export type Verdict = "authentic" | "counterfeit" | "replayed" | "unverified_artist";
export type PassportVerdict = Verdict | "record";

/** The ArtTrust policy over the core's three independent booleans. */
export function verdictOf(v: VerifyResult): Verdict {
  if (!v.chip_authentic) return "counterfeit";
  if (!v.not_replayed) return "replayed";
  if (!v.issuer_verified) return "unverified_artist";
  return "authentic";
}

const SEP = 0x1f; // unit separator — must match veritag-core arttrust/binding.py

/**
 * The Veritag domain binding: SHA-256(uid ‖ 0x1f ‖ title ‖ 0x1f ‖ artist_id).
 * Built by ARTISTS (not the curator); kept here byte-identical to the Python
 * backend and the Flutter app and pinned by test/portal.test.mjs.
 */
export async function veritagBinding(uid: string, title: string, artistId: string): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const parts = [enc.encode(uid), enc.encode(title), enc.encode(artistId)];
  const out: number[] = [];
  parts.forEach((p, i) => {
    if (i > 0) out.push(SEP);
    out.push(...p);
  });
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(out) as BufferSource));
}

// ---- domain types (mirror veritag-core api/schemas.py) ----------------------

export interface Curator {
  curator_id: string;
  name: string;
  bio?: string;
  avatar_url?: string;
}

export interface Artist {
  artist_id: string;
  name: string;
  issuer_id: string;
  verified: boolean;
  verified_by: Curator[];
}

export interface Artwork {
  uid: string;
  title: string;
  artist_id: string;
  binding_id: string;
  description?: string;
  image_data_url?: string;
  video_url?: string;
}

export interface CatalogueEntry {
  artwork: Artwork;
  artist_id: string;
  artist_name: string;
  artist_verified: boolean;
}

export interface ArtworkDetail {
  artwork: Artwork;
  artist: Artist | null;
  exhibitions: ExhibitionRef[];
}

export interface VerificationReq {
  request_id: string;
  artist_id: string;
  curator_id: string;
  status: "pending" | "confirmed" | "rejected" | "expired";
  created_at: number;
  expires_at: number;
  code: string | null;
  artist_name: string | null;
}

export interface ExhibitionItem {
  uid: string;
  caption?: string;
  title?: string | null;
  artist_name?: string | null;
}

export interface Exhibition {
  exhibition_id: string;
  title: string;
  curator_id: string;
  description?: string;
  cover_url?: string;
  starts_at?: string;
  ends_at?: string;
  venue?: string;
  lat?: number | null;
  lng?: number | null;
  items: ExhibitionItem[];
}

export interface ExhibitionRef {
  exhibition_id: string;
  title: string;
  curator_id: string;
  curator_name?: string | null;
  starts_at?: string;
  ends_at?: string;
  venue?: string;
  lat?: number | null;
  lng?: number | null;
}

export interface Passport {
  uid: string;
  ctr: number;
  verdict: PassportVerdict;
  chip_authentic: boolean;
  not_replayed: boolean;
  issuer_verified: boolean;
  issuer_id: string | null;
  reason: string;
  artwork: Artwork | null;
  artist: Artist | null;
  artist_verified: boolean;
  verified_by: Curator[];
  exhibitions: ExhibitionRef[];
}

export interface CreateExhibition {
  curator_id: string;
  title: string;
  description?: string;
  cover_url?: string;
  starts_at?: string;
  ends_at?: string;
  venue?: string;
  lat?: number | null;
  lng?: number | null;
  items: { uid: string; caption?: string }[];
}

export type UpdateExhibition = Partial<Omit<CreateExhibition, "curator_id">>;

export interface CuratorAuth {
  curator_id: string;
  name: string;
  token: string;
}

/** A tap, as the chip mirrors it: UID, read counter, CMAC (+ key version). */
export interface Tap {
  u: string;
  c: number;
  m: string;
  kv: number;
}

export class ApiError extends Error {
  constructor(readonly status: number, readonly detail: string) {
    super(detail);
  }
}

/** FastAPI errors: `{detail: "…"}` or a 422 `{detail: [{loc, msg}]}`. */
export async function readError(r: Response): Promise<ApiError> {
  let detail = r.statusText || "error";
  try {
    const body = await r.json();
    if (typeof body.detail === "string") detail = body.detail;
    else if (Array.isArray(body.detail) && body.detail[0]) {
      const d = body.detail[0];
      const field = Array.isArray(d.loc) ? d.loc[d.loc.length - 1] : "";
      detail = field && field !== "body" ? `${field}: ${d.msg}` : d.msg;
    }
  } catch {
    /* not json */
  }
  return new ApiError(r.status, detail);
}

/** Parse anything a tag or a share can hand us into a tap (or a bare UID). */
export function parseTap(input: string): Tap | { uid: string } | null {
  const raw = input.trim();
  if (!raw) return null;
  if (/^[0-9a-f]{8,32}$/i.test(raw)) return { uid: raw.toUpperCase() };
  const payload = /^v1;/.test(raw) ? raw : null; // the NDEF payload itself
  if (payload) {
    const kv = Object.fromEntries(payload.split(";").slice(1).map((p) => p.split("=") as [string, string]));
    if (!kv.u) return null;
    return { u: kv.u.toUpperCase(), c: parseInt(kv.c ?? "0", 16) || 0, m: (kv.m ?? "").toLowerCase(), kv: 1 };
  }
  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    const q = url.searchParams;
    const segs = url.pathname.split("/").filter(Boolean);
    if (q.get("u")) {
      return { u: q.get("u")!.toUpperCase(), c: Number(q.get("c") ?? "0") || 0, m: q.get("m") ?? "", kv: Number(q.get("kv") ?? "1") || 1 };
    }
    if (segs.length >= 2 && segs[segs.length - 2] === "t") return { uid: segs[segs.length - 1].toUpperCase() };
  } catch {
    /* not a URL */
  }
  return null;
}

/** Thin fetch client over the Veritag domain API. Carries the curator session
 *  token (when set) so the guarded endpoints authenticate transparently. */
export class VeritagApi {
  constructor(readonly base: string, private token?: string) {}

  private async j<T>(path: string, init?: RequestInit): Promise<T> {
    const headers: Record<string, string> = {};
    if (init?.body) headers["Content-Type"] = "application/json";
    if (this.token) headers["Authorization"] = `Bearer ${this.token}`;
    let r: Response;
    try {
      r = await fetch(`${this.base}${path}`, { ...init, headers: { ...headers, ...(init?.headers as object) } });
    } catch {
      throw new ApiError(0, "network");
    }
    if (!r.ok) throw await readError(r);
    return (r.status === 204 ? undefined : await r.json()) as T;
  }

  health(): Promise<{ status: string; attest_url?: string }> {
    // /meta, not /healthz: Google's frontend swallows /healthz on *.run.app.
    return this.j("/meta");
  }

  // -- curator session --
  register(username: string, name: string, password: string, bio = ""): Promise<CuratorAuth> {
    return this.j("/curators", { method: "POST", body: JSON.stringify({ username, name, password, bio }) });
  }
  login(username: string, password: string): Promise<CuratorAuth> {
    return this.j("/curators/login", { method: "POST", body: JSON.stringify({ username, password }) });
  }
  me(): Promise<Curator> {
    return this.j("/curators/me");
  }
  logout(): Promise<unknown> {
    return this.j("/curators/logout", { method: "POST" });
  }

  // -- directory --
  listCurators(): Promise<Curator[]> {
    return this.j("/curators");
  }
  artist(artistId: string): Promise<Artist> {
    return this.j(`/artists/${encodeURIComponent(artistId)}`);
  }
  artistArtworks(artistId: string): Promise<Artwork[]> {
    return this.j(`/artists/${encodeURIComponent(artistId)}/artworks`);
  }
  artistRequests(artistId: string): Promise<VerificationReq[]> {
    return this.j(`/artists/${encodeURIComponent(artistId)}/requests`);
  }

  // -- the blue check --
  incoming(curatorId: string, status = "pending"): Promise<VerificationReq[]> {
    return this.j(`/curators/${curatorId}/requests?status=${status}`);
  }
  confirm(requestId: string, code: string): Promise<VerificationReq> {
    return this.j(`/verifications/${requestId}/confirm`, { method: "POST", body: JSON.stringify({ code }) });
  }
  reject(requestId: string): Promise<VerificationReq> {
    return this.j(`/verifications/${requestId}/reject`, { method: "POST" });
  }

  // -- roster, catalogue, rooms --
  roster(curatorId: string): Promise<Artist[]> {
    return this.j(`/curators/${curatorId}/roster`);
  }
  catalogue(curatorId: string): Promise<CatalogueEntry[]> {
    return this.j(`/curators/${curatorId}/artworks`);
  }
  createExhibition(body: CreateExhibition): Promise<Exhibition> {
    return this.j("/exhibitions", { method: "POST", body: JSON.stringify(body) });
  }
  curatorExhibitions(curatorId: string): Promise<Exhibition[]> {
    return this.j(`/curators/${curatorId}/exhibitions`);
  }
  getExhibition(exhibitionId: string): Promise<Exhibition> {
    return this.j(`/exhibitions/${exhibitionId}`);
  }
  updateExhibition(exhibitionId: string, body: UpdateExhibition): Promise<Exhibition> {
    return this.j(`/exhibitions/${exhibitionId}`, { method: "PUT", body: JSON.stringify(body) });
  }
  deleteExhibition(exhibitionId: string): Promise<unknown> {
    return this.j(`/exhibitions/${exhibitionId}`, { method: "DELETE" });
  }
  artworkDetail(uid: string): Promise<ArtworkDetail> {
    return this.j(`/artworks/${encodeURIComponent(uid)}`);
  }

  // -- the tap --
  passport(u: string, c: number, m: string, kv = 1): Promise<Passport> {
    const q = new URLSearchParams({ u, c: String(c), m, kv: String(kv) });
    return this.j(`/passport?${q.toString()}`);
  }
}
