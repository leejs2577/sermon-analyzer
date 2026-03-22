/* ═══════════════════════════════════════════════════════
   Sermon Analyzer v5 — Prompt Engine (Gemini Only)
   - 양산중앙교회 → 정지훈 목사 고정
   - 설교자 불명 시 공란
   - 설명체 (~합니다/~입니다) 문체
   - Bold/하이라이트 강조
   ═══════════════════════════════════════════════════════ */

const Analyzer = (() => {

  // ─── 교회-설교자 매핑 ───
  const CHURCH_PREACHER_MAP = [
    { church: '양산중앙교회', preacher: '정지훈 목사', aliases: ['양산중앙'] }
  ];

  /**
   * 전체 분석 실행
   */
  async function analyze(videoInfo) {
    // 확정 메타데이터를 한 곳에서 수집
    const confirmedMeta = {
      date: videoInfo.publishedAt || '',
      url: videoInfo.url,
      ...resolveChurchAndPreacher(videoInfo)
    };

    const hasCaptions = !!videoInfo.captions;
    const prompt = buildPrompt(videoInfo, confirmedMeta, hasCaptions);

    // 자막 기반이면 youtubeUrl 전달 안 함 → gemini.js에서 fileData 제외
    const responseText = await LLMProvider.generate(prompt, {
      youtubeUrl: hasCaptions ? null : videoInfo.url
    });
    const result = parseResponse(responseText);

    // 확정 메타 한 번만 병합 (빈 문자열이면 Gemini 결과 유지)
    Object.entries(confirmedMeta).forEach(([key, val]) => {
      if (val) result.meta[key] = val;
    });

    return result;
  }

  /**
   * 메타데이터(채널명, 영상 제목)에서 교회명·설교자 사전 판단
   */
  function resolveChurchAndPreacher(videoInfo) {
    const resolved = { church: '', preacher: '' };
    const searchText = `${videoInfo.title || ''} ${videoInfo.channel || ''}`.toLowerCase();

    for (const entry of CHURCH_PREACHER_MAP) {
      const keywords = [entry.church, ...(entry.aliases || [])];
      if (keywords.some(kw => searchText.includes(kw.toLowerCase()))) {
        resolved.church = entry.church;
        resolved.preacher = entry.preacher;
        break;
      }
    }

    return resolved;
  }

  /**
   * 프롬프트 생성
   */
  function buildPrompt(videoInfo, confirmedMeta, hasCaptions = false) {
    // 확정되지 않은 메타만 Gemini에게 판단 요청
    const needChurch = !confirmedMeta.church;
    const needPreacher = !confirmedMeta.preacher;
    const needDate = !confirmedMeta.date;

    let metaInstruction = '';
    if (needChurch || needPreacher) {
      metaInstruction = `
【교회명·설교자 판단 지침】
- 영상 내 타이틀·자막·인트로·엔딩에서 교회명과 설교자명을 확인하세요.
- 채널명이나 영상 제목에 교회명이 포함되어 있으면 그것을 사용하세요.
- 설교자명을 확인할 수 없으면 meta.preacher를 빈 문자열("")로 두세요. 절대 추측하지 마세요.
- 교회명을 확인할 수 없으면 meta.church를 빈 문자열("")로 두세요. 절대 추측하지 마세요.`;
    }

    // 확정 필드는 스키마에서 제외하고, 미확정 필드만 Gemini에 요청
    const metaSchemaFields = [];
    if (needDate) metaSchemaFields.push('    "date": "설교 날짜 (YYYY-MM-DD 형식)"');
    if (needPreacher) metaSchemaFields.push('    "preacher": "설교자 이름 (확인 불가 시 빈 문자열. 절대 추측 금지)"');
    if (needChurch) metaSchemaFields.push('    "church": "교회명 (확인 불가 시 빈 문자열. 절대 추측 금지)"');
    metaSchemaFields.push('    "scripture": "성경 본문 (예: 누가복음 5:17-26)"');
    metaSchemaFields.push('    "title": "설교 제목"');
    metaSchemaFields.push('    "worshipType": "예배 종류 (주일예배, 수요예배, 새벽예배, 금요기도회, 사경회 등)"');
    metaSchemaFields.push('    "tags": ["태그1", "태그2", "태그3", "태그4", "태그5"]');

    const introText = hasCaptions
      ? '아래 제공된 설교 자막 텍스트를 **처음부터 끝까지** 읽고, 아래 지침에 따라 분석해 주세요.'
      : '위에 첨부된 YouTube 설교 영상을 **처음부터 끝까지** 시청하고, 아래 지침에 따라 분석해 주세요.';

    const captionNote = hasCaptions
      ? '\n※ 자막은 자동 생성일 수 있으므로, 문맥에 맞지 않는 표현은 적절히 보정하세요.'
      : '';

    return `당신은 한국 개신교 설교를 깊이 이해하고, 핵심을 정리하여 성도에게 전달하는 전문가입니다.

${introText}

═══════════════════════════════════
📋 영상 메타 정보 (참고용)
═══════════════════════════════════
- 영상 제목: ${videoInfo.title || '(알 수 없음)'}
- 채널명: ${videoInfo.channel || '(알 수 없음)'}
${metaInstruction}${captionNote}

═══════════════════════════════════
✍️ 문체 지침 (매우 중요)
═══════════════════════════════════
【절대 금지 표현】
- "본 설교는~", "이 설교에서는~", "설교자는~", "목사님은~" 등 3인칭 부연 설명 문체
- "~라고 말씀하셨습니다", "~라고 강조하셨습니다" 같은 전달·보도 문체
- "~에 대해 설교합니다", "~를 다루고 있습니다" 같은 메타 설명
- "~한다", "~이다", "~하라" 같은 단정·명령형 반말 문체

【사용할 문체 — 설명체 존댓말】
- 반드시 "~합니다", "~입니다", "~됩니다", "~있습니다" 등 존댓말 설명체를 사용하세요.
- 마치 설교 정리노트를 성도에게 공유하듯, 정중하고 따뜻한 설명체로 작성합니다.
- 권면할 때도 "~해야 합니다", "~하시기 바랍니다", "~권면합니다" 형식을 사용합니다.
- 예시 (올바른 문체):
  - "하나님은 광야에서 이스라엘에게 **말씀과 예배**를 먼저 주셨습니다."
  - "==믿음은 결단입니다.== 중풍병자의 친구들처럼, 장애물을 뚫고 예수께 나아가야 합니다."
  - "공동체를 떠나지 않아야 합니다. 상처받은 자를 환대하시기 바랍니다."
  - "이것이 바로 하나님이 원하시는 **예배의 본질**입니다."

【강조 표기법】
- **중요한 문장이나 핵심 단어**는 반드시 **bold** 처리 (**텍스트**)
- ==특별히 강조할 핵심 메시지나 선언문==은 ==하이라이트== 처리 (==텍스트==)
- 각 섹션마다 최소 2~3개 이상의 bold와 1개 이상의 하이라이트를 사용하세요.

═══════════════════════════════════
📐 출력 JSON 스키마
═══════════════════════════════════

반드시 아래 JSON 구조로만 응답하세요. JSON 외의 텍스트는 절대 포함하지 마세요.

{
  "meta": {
${metaSchemaFields.join(',\n')}
  },
  "summary": "설교 핵심을 3~5문장으로 설명체(~합니다/~입니다)로 작성. **bold**와 ==하이라이트== 포함.",
  "sections": [
    {
      "number": 1,
      "title": "소제목",
      "subtitle": "부제 또는 핵심 키워드 (원어 해설 포함 가능. 예: '파카드(살피다·등록하다)')",
      "content": "해당 섹션 내용을 설명체(~합니다/~입니다)로 작성. **bold**와 ==하이라이트== 적극 활용. 역사적 배경, 원어 해설, 예화 포함. 최소 200자 이상.",
      "keyPoint": "이 섹션의 **핵심 한 문장** (설명체)",
      "scriptureQuotes": [
        {
          "text": "성경 인용 본문",
          "reference": "성경 구절 (예: 마태복음 6:33)"
        }
      ]
    }
  ],
  "conclusion": {
    "points": [
      "결론 핵심 포인트 1 — 설명체, **bold** 포함",
      "결론 핵심 포인트 2",
      "결론 핵심 포인트 3"
    ],
    "meditation": [
      "묵상 질문 1 — 자기 성찰 질문",
      "묵상 질문 2",
      "묵상 질문 3",
      "묵상 질문 4"
    ],
    "closingVerse": {
      "text": "마무리 성경 구절 본문",
      "reference": "구절 위치 (예: 눅 5:20)"
    }
  }
}

═══════════════════════════════════
📌 추가 작성 지침
═══════════════════════════════════
1. sections는 설교 흐름에 따라 영상 길이에 맞게 섹션 수와 분량을 조정하세요:
   - 30분 이하: 3~4개 섹션, 각 150~300자
   - 30~60분: 4~6개 섹션, 각 150~250자
   - 60분 이상: 5~8개 섹션, 각 100~200자 (분량을 줄이더라도 중요한 모든 주제를 빠짐없이 다룰 것)
   긴 설교일수록 각 섹션 설명을 간략히 하되, 뒷부분 주제도 반드시 포함하세요. 앞부분에만 집중하지 마세요.
2. 설교자가 인용한 성경 구절을 정확히 기재하세요.
3. tags는 설교 핵심 주제를 5~8개 추출하세요.
4. 묵상 질문은 개인 신앙 적용에 초점을 맞추세요.
5. subtitle에 원어(히브리어·헬라어) 해설이 있으면 반드시 포함하세요.
6. 반드시 유효한 JSON만 출력하세요. 마크다운 코드블록(\`\`\`)으로 감싸지 마세요.
7. 전체적으로 **bold**와 ==하이라이트==를 적극 활용하여 가독성을 높이세요.
8. 영상이 길수록 각 섹션 설명을 간결하게 줄이고, 중요 주제 전체를 균형 있게 다루세요. 특히 결론·적용 부분도 반드시 포함하세요.
9. 모든 텍스트는 반드시 "~합니다/~입니다/~됩니다" 설명체 존댓말로 작성하세요.${hasCaptions ? `

═══════════════════════════════════
📝 설교 자막 텍스트
═══════════════════════════════════
${videoInfo.captions}` : ''}`;
  }

  /**
   * LLM 응답에서 JSON 파싱
   */
  function parseResponse(responseText) {
    let cleaned = responseText.trim();

    const codeBlockMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (codeBlockMatch) {
      cleaned = codeBlockMatch[1].trim();
    }

    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
      cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
    }

    try {
      const parsed = JSON.parse(cleaned);
      return validateAndNormalize(parsed);
    } catch (e) {
      console.error('JSON parse error:', e);
      console.error('Raw response (first 500 chars):', responseText.substring(0, 500));
      throw new Error('AI 응답을 파싱할 수 없습니다. 다시 시도해주세요.');
    }
  }

  /**
   * 응답 구조 검증 및 정규화
   */
  function validateAndNormalize(data) {
    const result = {
      meta: {
        date: data.meta?.date || '',
        preacher: data.meta?.preacher || '',
        church: data.meta?.church || '',
        scripture: data.meta?.scripture || '',
        title: data.meta?.title || '설교 제목',
        worshipType: data.meta?.worshipType || '예배',
        tags: Array.isArray(data.meta?.tags) ? data.meta.tags : [],
        url: data.meta?.url || ''
      },
      summary: data.summary || '',
      sections: [],
      conclusion: {
        points: Array.isArray(data.conclusion?.points) ? data.conclusion.points : [],
        meditation: Array.isArray(data.conclusion?.meditation) ? data.conclusion.meditation : [],
        closingVerse: {
          text: data.conclusion?.closingVerse?.text || '',
          reference: data.conclusion?.closingVerse?.reference || ''
        }
      }
    };

    if (Array.isArray(data.sections)) {
      result.sections = data.sections.map((s, i) => ({
        number: s.number || (i + 1),
        title: s.title || `섹션 ${i + 1}`,
        subtitle: s.subtitle || '',
        content: s.content || '',
        keyPoint: s.keyPoint || '',
        scriptureQuotes: Array.isArray(s.scriptureQuotes)
          ? s.scriptureQuotes.map(q => ({
            text: q.text || '',
            reference: q.reference || ''
          }))
          : []
      }));
    }

    return result;
  }

  return {
    analyze,
    buildPrompt,
    parseResponse
  };
})();
