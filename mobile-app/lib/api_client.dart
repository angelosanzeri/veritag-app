/// Dart client for the Veritag domain API (Piano C) — the domain backend the app talks to.
///
/// The artist flows (enrol, find a curator, request the blue check, mint) and the
/// visitor passport all go through here. Crypto stays in the SDK: keys are made
/// and signing happens on-device (IdentityService); this only carries domain JSON.
library api_client;

import 'dart:convert';

import 'package:http/http.dart' as http;

class VeritagApiError implements Exception {
  VeritagApiError(this.status, this.detail);
  final int status;
  final String detail;
  @override
  String toString() => '$status — $detail';
}

class Curator {
  Curator(this.curatorId, this.name, this.bio);
  final String curatorId;
  final String name;
  final String bio;
  factory Curator.fromJson(Map<String, dynamic> j) =>
      Curator(j['curator_id'] as String, j['name'] as String, (j['bio'] ?? '') as String);
}

class ArtistProfile {
  ArtistProfile(this.artistId, this.name, this.issuerId, this.verified, this.verifiedBy);
  final String artistId;
  final String name;
  final String issuerId;
  final bool verified;
  final List<Curator> verifiedBy;
  factory ArtistProfile.fromJson(Map<String, dynamic> j) => ArtistProfile(
        j['artist_id'] as String,
        j['name'] as String,
        j['issuer_id'] as String,
        (j['verified'] ?? false) as bool,
        ((j['verified_by'] ?? []) as List)
            .map((c) => Curator.fromJson(c as Map<String, dynamic>))
            .toList(),
      );
}

class VerificationReq {
  VerificationReq(this.requestId, this.code, this.status, this.expiresAt);
  final String requestId;
  final String? code;
  final String status;
  final double expiresAt;
  factory VerificationReq.fromJson(Map<String, dynamic> j) => VerificationReq(
        j['request_id'] as String,
        j['code'] as String?,
        j['status'] as String,
        (j['expires_at'] as num).toDouble(),
      );
}

class MintResult {
  MintResult(this.uid, this.chipKeyHex, this.bindingId);
  final String uid;
  final String chipKeyHex;
  final String bindingId;
  factory MintResult.fromJson(Map<String, dynamic> j) =>
      MintResult(j['uid'] as String, j['chip_key_hex'] as String, j['binding_id'] as String);
}

class ExhibitionRef {
  ExhibitionRef(this.title, this.startsAt, this.curatorName, this.venue);
  final String title;
  final String startsAt;
  final String? curatorName;
  final String venue;
  factory ExhibitionRef.fromJson(Map<String, dynamic> j) => ExhibitionRef(
        j['title'] as String,
        (j['starts_at'] ?? '') as String,
        j['curator_name'] as String?,
        (j['venue'] ?? '') as String,
      );
}

class Passport {
  Passport({
    required this.uid,
    required this.ctr,
    required this.verdict,
    required this.reason,
    required this.chipAuthentic,
    required this.notReplayed,
    required this.issuerVerified,
    required this.artworkTitle,
    required this.artworkDescription,
    required this.artworkImage,
    required this.artworkVideoUrl,
    required this.bindingId,
    required this.artistName,
    required this.artistVerified,
    required this.verifiedBy,
    required this.exhibitions,
  });
  final String uid;            // chip UID this passport belongs to
  final int ctr;               // SDM read counter — how many taps this one is
  final String verdict;
  final String reason;         // server's explanation when a check fails
  final bool chipAuthentic;
  final bool notReplayed;
  final bool issuerVerified;
  final String? artworkTitle;
  final String artworkDescription;
  final String artworkImage;   // data URL added by the artist, '' if none
  final String artworkVideoUrl;
  final String bindingId;      // the attested chip↔work binding
  final String? artistName;
  final bool artistVerified;
  final List<String> verifiedBy;
  final List<ExhibitionRef> exhibitions;

  factory Passport.fromJson(Map<String, dynamic> j) {
    final artwork = j['artwork'] as Map<String, dynamic>?;
    final artist = j['artist'] as Map<String, dynamic>?;
    return Passport(
      uid: (j['uid'] ?? '') as String,
      ctr: (j['ctr'] ?? 0) as int,
      verdict: j['verdict'] as String,
      reason: (j['reason'] ?? '') as String,
      chipAuthentic: j['chip_authentic'] as bool,
      notReplayed: j['not_replayed'] as bool,
      issuerVerified: j['issuer_verified'] as bool,
      artworkTitle: artwork?['title'] as String?,
      artworkDescription: (artwork?['description'] ?? '') as String,
      artworkImage: (artwork?['image_data_url'] ?? '') as String,
      artworkVideoUrl: (artwork?['video_url'] ?? '') as String,
      bindingId: (artwork?['binding_id'] ?? '') as String,
      artistName: artist?['name'] as String?,
      artistVerified: (j['artist_verified'] ?? false) as bool,
      verifiedBy: ((j['verified_by'] ?? []) as List)
          .map((c) => (c as Map<String, dynamic>)['name'] as String)
          .toList(),
      exhibitions: ((j['exhibitions'] ?? []) as List)
          .map((e) => ExhibitionRef.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}

/// Make a typed-in endpoint usable: trim, drop trailing slashes, and supply the
/// scheme when it's missing — without one `Uri.parse` yields a schemeless URI
/// and every call throws, which reads on screen as "backend unreachable".
/// A bare IP or a host:port is a dev box (http); anything else is the cloud.
String normalizeBase(String raw) {
  var b = raw.trim().replaceAll(RegExp(r'/+$'), '');
  if (b.isEmpty || b.contains('://')) return b;
  final lan = RegExp(r'^\d{1,3}(\.\d{1,3}){3}').hasMatch(b) || b.contains(':');
  return '${lan ? 'http' : 'https'}://$b';
}

class VeritagApi {
  VeritagApi(this.baseUrl, {http.Client? client}) : _http = client ?? http.Client();
  final String baseUrl;
  final http.Client _http;

  String get _base => normalizeBase(baseUrl);

  Future<dynamic> _json(http.Response r) async {
    if (r.statusCode >= 400) {
      String detail = r.reasonPhrase ?? 'error';
      try {
        detail = (jsonDecode(r.body) as Map<String, dynamic>)['detail'] as String? ?? detail;
      } catch (_) {}
      throw VeritagApiError(r.statusCode, detail);
    }
    return r.body.isEmpty ? null : jsonDecode(r.body);
  }

  Future<http.Response> _post(String path, Object body) => _http.post(
        Uri.parse('$_base$path'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode(body),
      );

  Future<bool> health() async {
    try {
      // /meta, not /healthz: Google's frontend swallows /healthz on *.run.app.
      // 9s, not 4: Cloud Run scales to zero, so the first ping pays a cold start.
      final r = await _http.get(Uri.parse('$_base/meta')).timeout(const Duration(seconds: 9));
      return r.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  /// The AttestCore base URL this deployment talks to (null if unreachable).
  Future<String?> attestUrl() async {
    try {
      final r = await _http.get(Uri.parse('$_base/meta')).timeout(const Duration(seconds: 9));
      return (jsonDecode(r.body) as Map<String, dynamic>)['attest_url'] as String?;
    } catch (_) {
      return null;
    }
  }

  Future<List<Curator>> listCurators() async {
    final r = await _http.get(Uri.parse('$_base/curators'));
    return ((await _json(r)) as List).map((c) => Curator.fromJson(c as Map<String, dynamic>)).toList();
  }

  Future<ArtistProfile> enrollArtist(String name, String publicKeyHex) async {
    final r = await _post('/artists', {'name': name, 'public_key_hex': publicKeyHex});
    return ArtistProfile.fromJson(await _json(r) as Map<String, dynamic>);
  }

  Future<ArtistProfile> getArtist(String artistId) async {
    final r = await _http.get(Uri.parse('$_base/artists/$artistId'));
    return ArtistProfile.fromJson(await _json(r) as Map<String, dynamic>);
  }

  Future<VerificationReq> requestVerification(String artistId, String curatorId) async {
    final r = await _post('/verifications', {'artist_id': artistId, 'curator_id': curatorId});
    return VerificationReq.fromJson(await _json(r) as Map<String, dynamic>);
  }

  Future<MintResult> mintArtwork(
    String artistId,
    String uid,
    String title,
    String signatureHex, {
    String description = '',
    String imageDataUrl = '',
    String videoUrl = '',
  }) async {
    final r = await _post('/artworks', {
      'artist_id': artistId,
      'uid': uid,
      'title': title,
      'signature_hex': signatureHex,
      'description': description,
      'image_data_url': imageDataUrl,
      'video_url': videoUrl,
    });
    return MintResult.fromJson(await _json(r) as Map<String, dynamic>);
  }

  Future<Passport> passport(String u, int c, String mHex, {int kv = 1}) async {
    final uri = Uri.parse('$_base/passport').replace(queryParameters: {
      'u': u,
      'c': '$c',
      'm': mHex,
      'kv': '$kv',
    });
    final r = await _http.get(uri);
    return Passport.fromJson(await _json(r) as Map<String, dynamic>);
  }

  /// Resolve a tag URL to its passport. Accepts both shapes:
  ///   …/t/<uid>                     (plain-written tag → record view)
  ///   …/verify?u=&c=&m=  |  …/passport?u=…  (SDM tag → live verify)
  Future<Passport> passportUrl(String url) {
    final uri = Uri.parse(url);
    final q = uri.queryParameters;
    var u = q['u'] ?? '';
    final segs = uri.pathSegments;
    if (u.isEmpty && segs.length >= 2 && segs[segs.length - 2] == 't') {
      u = segs.last;
    }
    return passport(u, int.tryParse(q['c'] ?? '0') ?? 0, q['m'] ?? '',
        kv: int.tryParse(q['kv'] ?? '1') ?? 1);
  }
}

// ── Veritag Studio: what a verified tap unlocks ─────────────────────────────

/// The artist's public card, as Studio serves it with a tap.
class ArtistCard {
  ArtistCard({
    required this.artistId,
    required this.displayName,
    required this.headline,
    required this.city,
    required this.website,
    required this.instagram,
  });
  final String artistId;
  final String displayName;
  final String headline;
  final String city;
  final String website;
  final String instagram;

  factory ArtistCard.fromJson(Map<String, dynamic> j) => ArtistCard(
        artistId: (j['artist_id'] ?? '') as String,
        displayName: (j['display_name'] ?? '') as String,
        headline: (j['headline'] ?? '') as String,
        city: (j['city'] ?? '') as String,
        website: (j['website'] ?? '') as String,
        instagram: (j['instagram'] ?? '') as String,
      );
}

/// A Private View this tap knows about: open (with the pass) or still locked.
class ViewTeaser {
  ViewTeaser(this.id, this.title, this.intro, this.itemCount, this.locked);
  final String id;
  final String title;
  final String intro;
  final int itemCount;
  final bool locked;

  factory ViewTeaser.fromJson(Map<String, dynamic> j) => ViewTeaser(
        j['id'] as String,
        (j['title'] ?? '') as String,
        (j['intro'] ?? '') as String,
        (j['item_count'] ?? 0) as int,
        (j['locked'] ?? true) as bool,
      );
}

/// Everything Studio adds on top of the passport.
class StudioExtras {
  StudioExtras({required this.card, required this.views, required this.pass, required this.story});
  final ArtistCard? card;
  final List<ViewTeaser> views;
  final String? pass; // signed Private View pass — only for a fresh, authentic tap
  final String story;

  factory StudioExtras.fromJson(Map<String, dynamic> j) {
    final card = j['card'] as Map<String, dynamic>?;
    final unlock = j['unlock'] as Map<String, dynamic>?;
    final extras = j['extras'] as Map<String, dynamic>?;
    return StudioExtras(
      card: card == null ? null : ArtistCard.fromJson(card),
      views: ((j['views'] ?? []) as List).map((v) => ViewTeaser.fromJson(v as Map<String, dynamic>)).toList(),
      pass: unlock?['token'] as String?,
      story: (extras?['story'] ?? '') as String,
    );
  }
}

/// A tap, resolved: the ArtTrust passport, plus Studio's experience when on.
class TapResult {
  TapResult(this.passport, [this.studio]);
  final Passport passport;
  final StudioExtras? studio;

  factory TapResult.fromExperience(Map<String, dynamic> j) =>
      TapResult(Passport.fromJson(j['passport'] as Map<String, dynamic>), StudioExtras.fromJson(j));
}

/// Client for Veritag Studio's /experience: one call that verifies the tap
/// with veritag-core and returns the passport with what it unlocks.
class StudioClient {
  StudioClient(this.baseUrl, {http.Client? client}) : _http = client ?? http.Client();
  final String baseUrl;
  final http.Client _http;

  String get _base => normalizeBase(baseUrl);

  String vcardUrl(String artistId) => '$_base/artists/${Uri.encodeComponent(artistId)}/vcard';

  Future<TapResult> experience(String u, int c, String mHex, {int kv = 1}) async {
    final uri = Uri.parse('$_base/experience').replace(queryParameters: {'u': u, 'c': '$c', 'm': mHex, 'kv': '$kv'});
    final r = await _http.get(uri).timeout(const Duration(seconds: 15));
    if (r.statusCode >= 400) {
      String detail = r.reasonPhrase ?? 'error';
      try {
        detail = (jsonDecode(r.body) as Map<String, dynamic>)['detail'] as String? ?? detail;
      } catch (_) {}
      throw VeritagApiError(r.statusCode, detail);
    }
    return TapResult.fromExperience(jsonDecode(r.body) as Map<String, dynamic>);
  }
}
