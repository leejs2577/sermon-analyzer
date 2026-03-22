/* ═══════════════════════════════════════════════════════
   captions — YouTube 영상 자막 추출
   1차: ANDROID Innertube Player API (가정용 IP에서 동작)
   2차: WEB HTML 파싱 + Innertube get_transcript (클라우드 IP 폴백)
   API 키 불필요
   ═══════════════════════════════════════════════════════ */

const INNERTUBE_URL = 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false';
const ANDROID_VERSION = '20.10.38';
const ANDROID_UA = `com.google.android.youtube/${ANDROID_VERSION} (Linux; U; Android 14)`;
const WEB_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  const videoId = event.queryStringParameters?.videoId;
  if (!videoId) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'videoId required' }) };
  }

  const debugLog = [];

  try {
    // 1차: ANDROID Innertube API (로컬/가정용 IP에서 동작)
    const r1 = await tryAndroidInnertube(videoId, debugLog);
    if (r1) return ok(headers, r1, 'android');

    // 2차: WEB Innertube Player API (클라우드 IP 대응)
    const r2 = await tryWebInnertube(videoId, debugLog);
    if (r2) return ok(headers, r2, 'web_innertube');

    // 3차: WEB HTML 파싱 + timedtext
    const r3 = await tryWebHtmlParsing(videoId, debugLog);
    if (r3) return ok(headers, r3, 'web_html');

    // 4차: get_transcript API (독립 시도)
    const r4 = await tryGetTranscriptDirect(videoId, debugLog);
    if (r4) return ok(headers, r4, 'get_transcript');

    return { statusCode: 200, headers, body: JSON.stringify({ captions: null, debug: debugLog }) };

  } catch (e) {
    debugLog.push(`top_error: ${e.message}`);
    return { statusCode: 200, headers, body: JSON.stringify({ captions: null, debug: debugLog }) };
  }
};

function ok(headers, captions, method) {
  return { statusCode: 200, headers, body: JSON.stringify({ captions, method }) };
}

/**
 * 1차: ANDROID Innertube Player API
 * 가정용 IP에서는 동작하지만 클라우드(AWS) IP에서는 LOGIN_REQUIRED 반환 가능
 */
async function tryAndroidInnertube(videoId, log) {
  try {
    const res = await fetch(INNERTUBE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': ANDROID_UA },
      body: JSON.stringify({
        context: { client: { clientName: 'ANDROID', clientVersion: ANDROID_VERSION } },
        videoId,
      }),
    });

    if (!res.ok) { log.push(`android_http_${res.status}`); return null; }
    const data = await res.json();
    const status = data?.playabilityStatus?.status;
    log.push(`android_play_${status}`);

    if (status !== 'OK') return null;

    const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    const selected = selectKoreanTrack(tracks);
    if (!selected) { log.push('android_no_ko_track'); return null; }

    const text = await fetchCaptionText(selected.baseUrl, ANDROID_UA);
    if (!text) log.push('android_timedtext_empty');
    return text;
  } catch (e) {
    log.push(`android_error: ${e.message}`);
    return null;
  }
}

/**
 * 2차: WEB Innertube Player API (POST)
 * ANDROID와 달리 WEB 클라이언트는 클라우드 IP에서도 동작할 수 있음
 */
async function tryWebInnertube(videoId, log) {
  try {
    const res = await fetch(INNERTUBE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': WEB_UA,
        'Origin': 'https://www.youtube.com',
        'Referer': 'https://www.youtube.com/',
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'WEB',
            clientVersion: '2.20241201.00.00',
            hl: 'ko',
            gl: 'KR',
          },
        },
        videoId,
      }),
    });

    if (!res.ok) { log.push(`web_innertube_http_${res.status}`); return null; }
    const data = await res.json();
    const status = data?.playabilityStatus?.status;
    log.push(`web_innertube_play_${status}`);

    const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    const selected = selectKoreanTrack(tracks);
    if (!selected) { log.push(`web_innertube_tracks_${tracks ? tracks.length : 'null'}`); return null; }

    const text = await fetchCaptionText(selected.baseUrl, WEB_UA);
    if (!text) { log.push('web_innertube_timedtext_empty'); return null; }
    return text;
  } catch (e) {
    log.push(`web_innertube_error: ${e.message}`);
    return null;
  }
}

/**
 * 3차: YouTube WEB 페이지 HTML 파싱
 * ytInitialPlayerResponse에서 captionTracks 추출 후 timedtext fetch
 */
async function tryWebHtmlParsing(videoId, log) {
  try {
    // SOCS=CAI= (yt-dlp 방식 최소 consent 수락) + bpctr로 제한 우회 시도
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}&bpctr=9999999999&has_verified=1`, {
      headers: {
        'User-Agent': WEB_UA,
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Cookie': 'SOCS=CAI=; CONSENT=YES+1',
      },
    });

    if (!res.ok) { log.push(`html_http_${res.status}`); return null; }
    const html = await res.text();
    log.push(`html_len_${html.length}`);

    const hasRecaptcha = html.includes('class="g-recaptcha"');
    const hasConsent = html.includes('consent.youtube.com') || html.includes('CONSENT');
    const hasPlayerResponse = html.includes('ytInitialPlayerResponse');
    const hasCaptionTracks = html.includes('"captionTracks"');
    log.push(`html_recaptcha_${hasRecaptcha}_consent_${hasConsent}_playerResp_${hasPlayerResponse}_captionTracks_${hasCaptionTracks}`);

    if (hasRecaptcha) return null;

    const tracks = extractTracksFromHtml(html);
    const selected = selectKoreanTrack(tracks);
    if (!selected) {
      log.push(`html_tracks_${tracks ? tracks.length : 'null'}_no_ko`);
      return null;
    }

    log.push(`html_track_${selected.languageCode}_${selected.kind || 'manual'}`);

    // baseUrl로 timedtext fetch
    const text = await fetchCaptionText(selected.baseUrl, WEB_UA);
    if (text) { log.push('html_timedtext_ok'); return text; }

    log.push('html_timedtext_empty');

    // get_transcript 폴백
    const text2 = await tryGetTranscript(html, videoId, log);
    return text2;
  } catch (e) {
    log.push(`html_error: ${e.message}`);
    return null;
  }
}

/**
 * HTML에서 captionTracks 추출 (ytInitialPlayerResponse 또는 인라인 JSON)
 */
function extractTracksFromHtml(html) {
  // 방법1: ytInitialPlayerResponse 변수에서 추출
  const varMarker = 'var ytInitialPlayerResponse = ';
  const varIdx = html.indexOf(varMarker);
  if (varIdx !== -1) {
    const start = varIdx + varMarker.length;
    let depth = 0;
    for (let i = start; i < Math.min(start + 500000, html.length); i++) {
      if (html[i] === '{') depth++;
      else if (html[i] === '}') {
        depth--;
        if (depth === 0) {
          try {
            const obj = JSON.parse(html.slice(start, i + 1));
            const tracks = obj?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
            if (Array.isArray(tracks) && tracks.length > 0) return tracks;
          } catch { /* 파싱 실패 시 방법2로 */ }
          break;
        }
      }
    }
  }

  // 방법2: "captionTracks": 인라인에서 대괄호 균형 매칭
  const marker = '"captionTracks":';
  const idx = html.indexOf(marker);
  if (idx === -1) return null;

  const arrStart = html.indexOf('[', idx + marker.length);
  if (arrStart === -1) return null;

  let depth = 0;
  for (let i = arrStart; i < Math.min(arrStart + 10000, html.length); i++) {
    if (html[i] === '[') depth++;
    else if (html[i] === ']') {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(html.substring(arrStart, i + 1)); }
        catch { return null; }
      }
    }
  }
  return null;
}

/**
 * Innertube get_transcript API (WEB 클라이언트)
 * HTML에서 innertubeApiKey, visitorData를 추출하여 호출
 */
async function tryGetTranscript(html, videoId, log) {
  try {
    const apiKeyMatch = html.match(/"innertubeApiKey":"([^"]+)"/);
    const visitorMatch = html.match(/"visitorData":"([^"]+)"/);
    if (!apiKeyMatch) { log.push('transcript_no_apikey'); return null; }

    const apiKey = apiKeyMatch[1];
    const visitorData = visitorMatch ? visitorMatch[1] : '';
    const params = buildTranscriptParams(videoId);

    const res = await fetch(`https://www.youtube.com/youtubei/v1/get_transcript?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': WEB_UA,
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'WEB',
            clientVersion: '2.20241201.00.00',
            hl: 'ko',
            gl: 'KR',
            visitorData,
          },
        },
        params,
      }),
    });

    log.push(`transcript_http_${res.status}`);
    if (!res.ok) return null;
    const data = await res.json();

    // 에러 확인
    if (data.error) {
      log.push(`transcript_err_${data.error.status || data.error.code}`);
      return null;
    }

    const segments = data?.actions?.[0]?.updateEngagementPanelAction
      ?.content?.transcriptRenderer?.content
      ?.transcriptSearchPanelRenderer?.body
      ?.transcriptSegmentListRenderer?.initialSegments;

    if (!Array.isArray(segments) || segments.length === 0) {
      log.push(`transcript_no_segments_keys_${Object.keys(data).join(',')}`);
      return null;
    }

    const texts = segments
      .map(seg => seg?.transcriptSegmentRenderer?.snippet?.runs?.map(r => r.text).join('') || '')
      .filter(Boolean);

    log.push(`transcript_segments_${texts.length}`);
    return texts.join(' ').replace(/\s+/g, ' ').trim();
  } catch (e) {
    log.push(`transcript_error: ${e.message}`);
    return null;
  }
}

/**
 * get_transcript params 생성 (base64 인코딩 protobuf)
 */
/**
 * 4차: get_transcript API 직접 호출 (HTML 없이)
 * YouTube 공개 innertube API 키 사용
 */
async function tryGetTranscriptDirect(videoId, log) {
  try {
    const params = buildTranscriptParams(videoId);
    // 공개 innertube API 키
    const apiKey = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';

    const res = await fetch(`https://www.youtube.com/youtubei/v1/get_transcript?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': WEB_UA,
        'Origin': 'https://www.youtube.com',
        'Referer': 'https://www.youtube.com/',
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'WEB',
            clientVersion: '2.20241201.00.00',
            hl: 'ko',
            gl: 'KR',
          },
        },
        params,
      }),
    });

    log.push(`direct_transcript_http_${res.status}`);
    if (!res.ok) return null;

    const data = await res.json();
    if (data.error) {
      log.push(`direct_transcript_err_${data.error.status || data.error.code}`);
      return null;
    }

    // 트랜스크립트 세그먼트 추출
    const segments = data?.actions?.[0]?.updateEngagementPanelAction
      ?.content?.transcriptRenderer?.content
      ?.transcriptSearchPanelRenderer?.body
      ?.transcriptSegmentListRenderer?.initialSegments;

    if (!Array.isArray(segments) || segments.length === 0) {
      log.push(`direct_transcript_no_segments`);
      return null;
    }

    const texts = segments
      .map(seg => seg?.transcriptSegmentRenderer?.snippet?.runs?.map(r => r.text).join('') || '')
      .filter(Boolean);

    if (texts.length === 0) { log.push('direct_transcript_empty_texts'); return null; }

    log.push(`direct_transcript_ok_${texts.length}`);
    return texts.join(' ').replace(/\s+/g, ' ').trim();
  } catch (e) {
    log.push(`direct_transcript_error: ${e.message}`);
    return null;
  }
}

function buildTranscriptParams(videoId) {
  // 간단한 protobuf 인코딩: field 1 { field 1: videoId }
  const vidBytes = Buffer.from(videoId, 'utf8');

  // inner: 0a [len] [videoId]
  const inner = Buffer.concat([
    Buffer.from([0x0a, vidBytes.length]),
    vidBytes,
  ]);

  // outer: 0a [len] [inner]
  const outer = Buffer.concat([
    Buffer.from([0x0a, inner.length]),
    inner,
  ]);

  return outer.toString('base64');
}

/**
 * 한국어 자막 트랙 선택 (수동 우선, 자동생성 폴백)
 */
function selectKoreanTrack(tracks) {
  if (!Array.isArray(tracks) || tracks.length === 0) return null;

  const isKo = (t) => /^ko(-[A-Za-z]+)?$/.test(t.languageCode);
  const isAsr = (t) => (t.kind || '').toLowerCase() === 'asr';

  return tracks.find(t => isKo(t) && !isAsr(t))
    || tracks.find(t => isKo(t) && isAsr(t));
}

/**
 * timedtext API에서 자막 텍스트 추출
 */
async function fetchCaptionText(baseUrl, userAgent) {
  try {
    const res = await fetch(baseUrl, {
      headers: { 'User-Agent': userAgent || WEB_UA },
    });

    if (!res.ok) return null;
    const xml = await res.text();
    if (!xml || xml.length === 0) return null;

    // srv3 형식: <p t="ms" d="ms"><s>텍스트</s></p> 또는 <text start="" dur="">텍스트</text>
    let texts = [];

    // <p> + <s> 형식 (srv3)
    const pRegex = /<p\s+t="\d+"\s+d="\d+"[^>]*>([\s\S]*?)<\/p>/g;
    let m;
    while ((m = pRegex.exec(xml)) !== null) {
      const inner = m[1];
      // <s> 태그 안의 텍스트 추출
      const sTexts = [];
      const sRegex = /<s[^>]*>([^<]*)<\/s>/g;
      let sm;
      while ((sm = sRegex.exec(inner)) !== null) {
        sTexts.push(sm[1]);
      }
      // <s> 태그가 없으면 태그 제거 후 텍스트
      const text = sTexts.length > 0 ? sTexts.join('') : inner.replace(/<[^>]+>/g, '');
      const decoded = decodeEntities(text).trim();
      if (decoded) texts.push(decoded);
    }

    // <text> 형식 (기본 XML) 폴백
    if (texts.length === 0) {
      const textRegex = /<text[^>]*>([\s\S]*?)<\/text>/g;
      while ((m = textRegex.exec(xml)) !== null) {
        const decoded = decodeEntities(m[1]).trim();
        if (decoded) texts.push(decoded);
      }
    }

    return texts.join(' ').replace(/\s+/g, ' ').trim();
  } catch (e) {
    console.error(`[captions] fetchCaptionText 에러:`, e.message);
    return null;
  }
}

/**
 * HTML 엔티티 디코딩
 */
function decodeEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/\\n/g, '\n');
}
