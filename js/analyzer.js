/* ═══════════════════════════════════════════════════════
   Sermon Analyzer v5 — Prompt Engine (Gemini Only)
   - 양산중앙교회 → 정지훈 목사 고정
   - 설교자 불명 시 공란
   - 설명체 (~합니다/~입니다) 문체
   - Bold/하이라이트 강조
   ═══════════════════════════════════════════════════════ */

const Analyzer = (() => {

  // ─── 교회-설교자 매핑 (하드코딩) ───
  const CHURCH_PREACHER_MAP = {
    '양산중앙교회': '정지훈 목사'
  };

  /**
   * 전체 분석 실행
   */
  async function analyze(videoInfo) {
    // 메타데이터에서 교회명·설교자를 사전 판단
    const preResolved = resolveChurchAndPreacher(videoInfo);

    const prompt = buildPrompt(videoInfo, preResolved);

    const options = {
      youtubeUrl: videoInfo.url
    };

    const responseText = await LLMProvider.generate(prompt, options);
    const result = parseResponse(responseText);

    // 사전 판단된 교회명·설교자가 있으면 강제 덮어쓰기
    if (preResolved.church) {
      result.meta.church = preResolved.church;
    }
    if (preResolved.preacher) {
      result.meta.preacher = preResolved.preacher;
    }

    // YouTube 발행 날짜를 항상 우선 적용
    if (videoInfo.publishedAt) {
      result.meta.date = videoInfo.publishedAt;
    }

    return result;
  }

  /**
   * 메타데이터(채널명, 영상 제목)에서 교회명·설교자 사전 판단
   */
  function resolveChurchAndPreacher(videoInfo) {
    const resolved = { church: '', preacher: '' };
    const searchText = `${videoInfo.title || ''} ${videoInfo.channel || ''}`.toLowerCase();

    // 매핑 테이블에서 교회명 매칭
    for (const [churchName, preacherName] of Object.entries(CHURCH_PREACHER_MAP)) {
      if (searchText.includes(churchName.toLowerCase()) || searchText.includes(churchName.replace(/교회$/, ''))) {
        resolved.church = churchName;
        resolved.preacher = preacherName;
        break;
      }
    }

    return resolved;
  }

  /**
   * 프롬프트 생성
   */
  function buildPrompt(videoInfo, preResolved) {
    // 교회·설교자 판단 지침을 동적으로 생성
    let metaInstruction = '';
    if (preResolved.church && preResolved.preacher) {
      metaInstruction = `
【교회명·설교자 — 확정 정보】
- 교회명: "${preResolved.church}"
- 설교자: "${preResolved.preacher}"
위 정보는 확정된 값입니다. meta.church와 meta.preacher에 반드시 위 값을 그대로 사용하세요.`;
    } else {
      metaInstruction = `
【교회명·설교자 판단 지침】
- 영상 내 타이틀·자막·인트로·엔딩에서 교회명과 설교자명을 확인하세요.
- 채널명이나 영상 제목에 교회명이 포함되어 있으면 그것을 사용하세요.
- 설교자명을 확인할 수 없으면 meta.preacher를 빈 문자열("")로 두세요. 절대 추측하지 마세요.
- 교회명을 확인할 수 없으면 meta.church를 빈 문자열("")로 두세요. 절대 추측하지 마세요.`;
    }

    return `당신은 한국 개신교 설교를 깊이 이해하고, 핵심을 정리하여 성도에게 전달하는 전문가입니다.

위에 첨부된 YouTube 설교 영상을 **처음부터 끝까지** 시청하고, 아래 지침에 따라 분석해 주세요.

═══════════════════════════════════
📋 영상 메타 정보 (참고용)
═══════════════════════════════════
- 영상 제목: ${videoInfo.title || '(알 수 없음)'}
- 채널명: ${videoInfo.channel || '(알 수 없음)'}
- URL: ${videoInfo.url || ''}
${metaInstruction}

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
    "date": "설교 날짜 (YYYY-MM-DD 형식). 빈 문자열로 남겨도 됩니다.",
    "preacher": "설교자 이름 (확인 불가 시 빈 문자열. 절대 추측 금지)",
    "church": "교회명 (확인 불가 시 빈 문자열. 절대 추측 금지)",
    "scripture": "성경 본문 (예: 누가복음 5:17-26)",
    "title": "설교 제목",
    "worshipType": "예배 종류 (주일예배, 수요예배, 새벽예배, 금요기도회, 사경회 등)",
    "tags": ["태그1", "태그2", "태그3", "태그4", "태그5"]
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
9. 모든 텍스트는 반드시 "~합니다/~입니다/~됩니다" 설명체 존댓말로 작성하세요.`;
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
        tags: Array.isArray(data.meta?.tags) ? data.meta.tags : []
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
