/**
 * Client for Veritag Studio — the companion service (studio-api/) that adds
 * artist cards + vCards, extended passports, Private Views, leads and insights
 * on top of veritag-core.
 */
import { ApiError, readError, type Passport } from "./portal.js";

export interface Card {
  artist_id: string;
  display_name: string;
  headline: string;
  bio: string;
  avatar: string;
  email: string;
  phone: string;
  website: string;
  instagram: string;
  city: string;
  studio_address: string;
  booking_url: string;
  updated_at?: number | null;
  verified?: boolean;
  verified_by?: string[];
}

export interface CardEdit extends Omit<Card, "artist_id" | "updated_at" | "verified" | "verified_by"> {
  show_email: boolean;
  show_phone: boolean;
}

export interface Extras {
  uid: string;
  year: string;
  medium: string;
  dimensions: string;
  edition: string;
  story: string;
  audio_url: string;
  links: { label: string; url: string }[];
  images: string[];
}

export type ExtrasIn = Omit<Extras, "uid">;

export interface ViewItem {
  id: string;
  view_id: string;
  title: string;
  year: string;
  medium: string;
  dimensions: string;
  description: string;
  image: string;
  price: number | null;
  currency: string;
  price_on_request: boolean;
  availability: "available" | "reserved" | "sold";
  created_at: number;
}

export type ItemIn = Omit<ViewItem, "id" | "view_id" | "created_at">;

export interface PrivateView {
  id: string;
  title: string;
  intro: string;
  cover: string;
  status: "draft" | "live";
  access: "tap" | "link";
  scope: "anchors" | "artist";
  anchors: string[];
  artist_id: string | null;
  owner_kind: "curator" | "artist";
  owner_id: string;
  owner_name: string;
  created_at: number;
  updated_at: number;
  opens: number;
  item_count: number;
  items?: ViewItem[];
}

export type ViewIn = Pick<PrivateView, "title" | "intro" | "cover" | "status" | "access" | "scope" | "anchors"> & {
  artist_id?: string | null;
};

export interface PublicView {
  id: string;
  title: string;
  intro: string;
  cover: string;
  access: "tap" | "link";
  artist_id: string | null;
  owner_name: string;
  items: ViewItem[];
  card: (Card & { verified?: boolean }) | null;
}

export interface ViewTeaser {
  id: string;
  title: string;
  cover: string;
  intro: string;
  access: "tap" | "link";
  item_count: number;
  locked: boolean;
  owner_name: string;
}

export interface Experience {
  passport: Passport;
  extras: Extras | null;
  card: Card | null;
  unlock: { token: string; expires_at: number } | null;
  views: ViewTeaser[];
}

export type LeadKind = "studio_visit" | "info" | "purchase";
export type LeadStatus = "new" | "contacted" | "won" | "archived";

export interface LeadIn {
  kind: LeadKind;
  artist_id?: string | null;
  view_id?: string | null;
  item_id?: string | null;
  uid?: string | null;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  message?: string;
  consent: boolean;
  website?: string;
}

export interface Lead extends Required<Omit<LeadIn, "consent" | "website">> {
  id: string;
  status: LeadStatus;
  note: string;
  view_title: string;
  item_title: string;
  created_at: number;
}

export interface Insights {
  days: number;
  series: { date: string; taps: number; authentic: number; alerts: number; records: number; vcards: number; views: number; leads: number }[];
  totals: { taps: number; authentic: number; alerts: number; records: number; vcards: number; views: number; leads: number };
  top_works: { uid: string; taps: number }[];
  by_artist: { artist_id: string; taps: number }[];
  leads_open: number;
}

export interface Invite {
  code: string;
  artist_id: string;
  expires_at: number;
  join_url: string;
}

export interface StudioAuth {
  token: string;
  artist_id: string;
  name: string;
}

export class StudioApi {
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
    return (await r.json()) as T;
  }
  private send<T>(method: string, path: string, body?: unknown): Promise<T> {
    return this.j(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  }

  meta(): Promise<{ status: string; version: string }> {
    return this.j("/meta");
  }

  // accounts
  me(): Promise<{ kind: "curator" | "artist"; id: string; name: string }> {
    return this.j("/me");
  }
  invite(artistId: string): Promise<Invite> {
    return this.send("POST", "/invites", { artist_id: artistId });
  }
  readInvite(code: string): Promise<{ artist_id: string; artist_name: string; curator_name: string; expires_at: number }> {
    return this.j(`/invites/${encodeURIComponent(code)}`);
  }
  join(code: string, username: string, password: string): Promise<StudioAuth> {
    return this.send("POST", "/accounts", { code, username, password });
  }
  login(username: string, password: string): Promise<StudioAuth> {
    return this.send("POST", "/accounts/login", { username, password });
  }
  logout(): Promise<unknown> {
    return this.send("POST", "/accounts/logout");
  }

  // cards
  card(artistId: string): Promise<Card> {
    return this.j(`/artists/${encodeURIComponent(artistId)}/card`);
  }
  cardForEdit(artistId: string): Promise<CardEdit> {
    return this.j(`/artists/${encodeURIComponent(artistId)}/card/edit`);
  }
  saveCard(artistId: string, card: CardEdit): Promise<Card> {
    return this.send("PUT", `/artists/${encodeURIComponent(artistId)}/card`, card);
  }
  vcardUrl(artistId: string): string {
    return `${this.base}/artists/${encodeURIComponent(artistId)}/vcard`;
  }

  // extended passport
  extras(uid: string): Promise<Extras> {
    return this.j(`/artworks/${encodeURIComponent(uid)}/extras`);
  }
  saveExtras(uid: string, extras: ExtrasIn): Promise<Extras> {
    return this.send("PUT", `/artworks/${encodeURIComponent(uid)}/extras`, extras);
  }

  // private views
  views(): Promise<PrivateView[]> {
    return this.j("/views");
  }
  view(id: string): Promise<PrivateView> {
    return this.j(`/views/${id}`);
  }
  createView(body: ViewIn): Promise<PrivateView> {
    return this.send("POST", "/views", body);
  }
  updateView(id: string, body: Partial<ViewIn>): Promise<PrivateView> {
    return this.send("PUT", `/views/${id}`, body);
  }
  deleteView(id: string): Promise<unknown> {
    return this.send("DELETE", `/views/${id}`);
  }
  addItem(viewId: string, item: ItemIn): Promise<ViewItem> {
    return this.send("POST", `/views/${viewId}/items`, item);
  }
  updateItem(viewId: string, itemId: string, item: ItemIn): Promise<ViewItem> {
    return this.send("PUT", `/views/${viewId}/items/${itemId}`, item);
  }
  deleteItem(viewId: string, itemId: string): Promise<unknown> {
    return this.send("DELETE", `/views/${viewId}/items/${itemId}`);
  }
  reorder(viewId: string, itemIds: string[]): Promise<PrivateView> {
    return this.send("PUT", `/views/${viewId}/order`, { item_ids: itemIds });
  }
  publicView(id: string, pass?: string): Promise<PublicView> {
    return this.j(`/public/views/${id}${pass ? `?k=${encodeURIComponent(pass)}` : ""}`);
  }

  // the tap
  experience(u: string, c: number, m: string, kv = 1): Promise<Experience> {
    const q = new URLSearchParams({ u, c: String(c), m, kv: String(kv) });
    return this.j(`/experience?${q.toString()}`);
  }

  // leads + insights
  sendLead(lead: LeadIn): Promise<{ ok: boolean; id: string }> {
    return this.send("POST", "/leads", lead);
  }
  leads(): Promise<Lead[]> {
    return this.j("/leads");
  }
  updateLead(id: string, status: LeadStatus, note?: string): Promise<Lead> {
    return this.send("PATCH", `/leads/${id}`, { status, note });
  }
  insights(days = 30): Promise<Insights> {
    return this.j(`/insights?days=${days}`);
  }
}
