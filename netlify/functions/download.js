// 카카오톡 인앱 브라우저 파일 다운로드 대응
// HTTP Content-Disposition 헤더 방식 — iOS/Android 모두 지원
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let content, filename, contentType;
  try {
    ({ content, filename, contentType } = JSON.parse(event.body));
  } catch (e) {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  if (!content || !filename || !contentType) {
    return { statusCode: 400, body: 'content, filename, contentType 필드가 필요합니다.' };
  }

  // 파일명 특수문자 제거
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
