// 카카오톡 인앱 브라우저 파일 다운로드 대응
// Form POST submit 방식 — 브라우저가 직접 HTTP 응답 처리하여 다운로드 매니저 트리거
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Form submit: application/x-www-form-urlencoded 파싱
  const params = new URLSearchParams(event.body);
  const contentB64  = params.get('content');     // Base64 인코딩된 파일 내용
  const filename    = params.get('filename');
  const contentType = params.get('contentType');

  if (!contentB64 || !filename || !contentType) {
    return { statusCode: 400, body: '필수 필드 누락' };
  }

  // Base64 → 원본 텍스트 (UTF-8, 한글 안전)
  const content = Buffer.from(contentB64, 'base64').toString('utf-8');
  const safeFilename = filename.replace(/[/\\?%*:|"<>]/g, '_');

  return {
    statusCode: 200,
    headers: {
      'Content-Type': contentType,
      // RFC 5987 인코딩 — 한글 파일명 지원
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(safeFilename)}`,
      'Cache-Control': 'no-store',
    },
    body: content,
  };
};
