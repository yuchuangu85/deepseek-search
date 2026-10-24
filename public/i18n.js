/*
 * DeepSeek Search — translations.
 * Plain browser global (no modules, no build step): window.DS_I18N
 * Supported languages: zh-CN, en, ja, ko.
 */
(function (global) {
  'use strict';

  var SUPPORTED = ['zh-CN', 'en', 'ja', 'ko'];
  var DEFAULT = 'zh-CN';

  /* Language names always render in their own script. */
  var LANG_NAMES = {
    'zh-CN': '中文',
    en: 'English',
    ja: '日本語',
    ko: '한국어'
  };

  var dictionaries = {
    'zh-CN': {
      appName: 'DeepSeek Search',
      docTitleSearch: '“{query}” — DeepSeek Search',

      heroTitle: '用 DeepSeek 搜索网络',
      heroSubtitle: '简洁、快速，答案有据可循。',

      searchLabel: '搜索关键词',
      searchPlaceholder: '搜索网络内容…',
      searchSubmit: '搜索',
      searchClear: '清空搜索',
      resultLimitLabel: '每次搜索返回的结果条数',
      resultLimitUnit: '条',
      paginationLabel: '搜索结果分页',
      pagePrevious: '上一页',
      pageNext: '下一页',
      pageNumberLabel: '第 {page} 页',
      pageStatus: '第 {page} / {pages} 页',
      shortcutFocus: '按 {key} 聚焦搜索框',

      themeLabel: '外观',
      themeSwitchToDark: '切换到深色外观',
      themeSwitchToLight: '切换到浅色外观',
      langLabel: '语言',

      helpButton: '搜索语法帮助',
      helpTitle: '搜索语法',
      helpIntro: '用运算符缩小范围，可与普通关键词组合使用。',
      helpOperatorsTitle: '运算符',
      helpClose: '关闭',
      helpSetupTitle: '配置 API',
      setupStep1: '打开项目目录中的 .env 文件。',
      setupStep2: '在 .env 中添加：',
      setupStep3: '重启服务并刷新此页面。',
      setupDocs: '查看 DeepSeek 搜索 API 指南',

      noticeTitle: '尚未配置 API 密钥',
      noticeBody: '将 DEEPSEEK_API_KEY 添加到 .env 并重启服务，即可获取实时结果。',
      noticeOffline: '无法连接搜索服务，请确认服务已启动后重试。',
      noticeSetup: '如何配置',
      noticeDismiss: '关闭提示',

      demoBadge: '演示数据',
      demoBadgeTitle: '模拟结果，未调用实时 API',
      demoNoticeTitle: '当前为演示模式',
      demoNoticeBody: '所有查询都会返回同一组示例结果。',
      demoNoticeAction: '如何启用真实搜索',
      scoreTitle: '重排得分 {score}',

      emptyTitle: '搜索任何内容',
      emptyHint: '输入问题，或从下面的示例开始。',
      suggestions: [
        'DeepSeek V4 发布说明',
        'site:deepseek.com API 文档',
        'lang:zh 大模型 推理',
        'after:2025 开源大模型 进展'
      ],

      resultsTitle: '搜索结果',
      resultCountOne: '{count} 条',
      resultCountMany: '{count} 条',
      resultsFor: '关于“{query}”',
      elapsed: '用时 {ms} 毫秒',

      loading: '正在搜索…',
      loadingStatus: '正在搜索“{query}”',
      noResultsTitle: '未找到“{query}”的结果',
      noResultsHint: '尝试减少关键词，或放宽 site:、lang: 与日期筛选。',

      errorRetry: '重试',
      errors: {
        missing_api_key: {
          title: '需要 API 密钥',
          message: '将 DEEPSEEK_API_KEY 添加到 .env 并重启服务。'
        },
        invalid_request: {
          title: '搜索请求无效',
          message: '请检查关键词后重试。'
        },
        rate_limited: {
          title: '请求过于频繁',
          message: '请稍候片刻再试。'
        },
        upstream_error: {
          title: 'DeepSeek 搜索暂不可用',
          message: '上游服务返回错误，请稍后重试。'
        },
        invalid_api_key: {
          title: 'API 密钥无效',
          message: '更新 .env 中的 DEEPSEEK_API_KEY 并重启服务。'
        },
        insufficient_balance: {
          title: '账户余额不足',
          message: '请为 DeepSeek 账户充值后重试。'
        },
        forbidden: {
          title: '请求被拒绝',
          message: '搜索服务拒绝了此请求，请稍后重试。'
        },
        payload_too_large: {
          title: '搜索内容过长',
          message: '请缩短搜索内容后重试。'
        },
        internal_error: {
          title: '服务器错误',
          message: '服务端发生错误，请稍后重试。'
        },
        timeout: {
          title: '搜索超时',
          message: '服务器响应时间过长，请重试。'
        },
        not_found: {
          title: '未找到搜索接口',
          message: '接口路由缺失，请确认服务版本。'
        },
        network_error: {
          title: '无法连接服务器',
          message: '请检查网络连接与服务器状态。'
        },
        unknown: {
          title: '出了点问题',
          message: '发生未知错误，请重试。'
        }
      },

      more: '更多',
      less: '收起',
      summaryLabel: '摘要',
      authority3: '可信来源',
      authority4: '高可信来源',
      quality: '高度相关',
      copyLink: '复制链接',
      copied: '已复制',
      copyFailed: '复制失败',

      footerNote: '由 DeepSeek 搜索 API 提供支持',
      footerHint: '{key} 随处搜索',
      skipToResults: '跳到搜索结果',

      operators: [
        {
          key: 'site',
          label: 'site:',
          desc: '只返回指定站点的结果',
          example: 'site:deepseek.com'
        },
        {
          key: 'excludeSite',
          label: '-site:',
          desc: '排除指定站点',
          example: '-site:reddit.com'
        },
        {
          key: 'excludeTerm',
          label: '-',
          desc: '排除某个词',
          example: 'deepseek -发布'
        },
        {
          key: 'excludePhrase',
          label: '-"…"',
          desc: '排除一个精确短语',
          example: '-"新闻稿"'
        },
        {
          key: 'exactPhrase',
          label: '"…"',
          desc: '精确匹配短语',
          example: '"上下文窗口"'
        },
        {
          key: 'lang',
          label: 'lang:',
          desc: '限定结果语言',
          example: 'lang:zh'
        },
        {
          key: 'after',
          label: 'after:',
          desc: '仅返回该日期之后的页面',
          example: 'after:2025-01-01'
        },
        {
          key: 'before',
          label: 'before:',
          desc: '仅返回该日期之前的页面',
          example: 'before:2026-01-01'
        }
      ]
    },

    en: {
      appName: 'DeepSeek Search',
      docTitleSearch: '“{query}” — DeepSeek Search',

      heroTitle: 'Search the web with DeepSeek',
      heroSubtitle: 'Direct answers from the open web — calm, fast, and grounded in sources.',

      searchLabel: 'Search query',
      searchPlaceholder: 'Search the web…',
      searchSubmit: 'Search',
      searchClear: 'Clear search',
      resultLimitLabel: 'Results per search',
      resultLimitUnit: 'results',
      paginationLabel: 'Results pagination',
      pagePrevious: 'Previous',
      pageNext: 'Next',
      pageNumberLabel: 'Page {page}',
      pageStatus: 'Page {page} of {pages}',
      shortcutFocus: 'Press {key} to focus the search field',

      themeLabel: 'Appearance',
      themeSwitchToDark: 'Switch to dark appearance',
      themeSwitchToLight: 'Switch to light appearance',
      langLabel: 'Language',

      helpButton: 'Search syntax help',
      helpTitle: 'Search syntax',
      helpIntro: 'Narrow results with operators. Combine them with ordinary keywords.',
      helpOperatorsTitle: 'Operators',
      helpClose: 'Close',
      helpSetupTitle: 'Set up the API',
      setupStep1: 'Open the .env file in the project folder.',
      setupStep2: 'Add this to .env:',
      setupStep3: 'Restart the server and reload this page.',
      setupDocs: 'Open the DeepSeek Search API guide',

      noticeTitle: 'API key not configured',
      noticeBody: 'Add DEEPSEEK_API_KEY to .env and restart the server to get live results.',
      noticeOffline: "Can't reach the search service. Make sure the server is running, then try again.",
      noticeSetup: 'How to set up',
      noticeDismiss: 'Dismiss notice',

      demoBadge: 'Demo data',
      demoBadgeTitle: 'Mock results — no live API calls',
      demoNoticeTitle: 'Demo mode',
      demoNoticeBody: 'Every query returns the same sample results.',
      demoNoticeAction: 'How to enable live search',
      scoreTitle: 'Rerank score {score}',

      emptyTitle: 'Search anything',
      emptyHint: 'Ask a question, or start with one of these.',
      suggestions: [
        'DeepSeek V4 release notes',
        'site:deepseek.com API docs',
        'lang:en AI agent benchmarks',
        'after:2025 open source LLM'
      ],

      resultsTitle: 'Results',
      resultCountOne: '{count} result',
      resultCountMany: '{count} results',
      resultsFor: 'for “{query}”',
      elapsed: 'in {ms} ms',

      loading: 'Searching…',
      loadingStatus: 'Searching for “{query}”',
      noResultsTitle: 'No results for “{query}”',
      noResultsHint: 'Try fewer words, or loosen the site:, lang:, or date filters.',

      errorRetry: 'Try again',
      errors: {
        missing_api_key: {
          title: 'API key required',
          message: 'Add DEEPSEEK_API_KEY to .env and restart the server.'
        },
        invalid_request: {
          title: 'That search was not valid',
          message: 'Check the query and try again.'
        },
        rate_limited: {
          title: 'Too many requests',
          message: 'Wait a moment, then try again.'
        },
        upstream_error: {
          title: 'DeepSeek Search is unavailable',
          message: 'The upstream service returned an error. Try again shortly.'
        },
        invalid_api_key: {
          title: 'API key rejected',
          message: 'Update DEEPSEEK_API_KEY in .env and restart the server.'
        },
        insufficient_balance: {
          title: 'Insufficient balance',
          message: 'Top up your DeepSeek account balance, then try again.'
        },
        forbidden: {
          title: 'Request blocked',
          message: 'The search service blocked this request. Try again shortly.'
        },
        payload_too_large: {
          title: 'Search too large',
          message: 'Shorten the search request and try again.'
        },
        internal_error: {
          title: 'Server error',
          message: 'The server hit an error. Try again shortly.'
        },
        timeout: {
          title: 'The search timed out',
          message: 'The server took too long to respond. Try again.'
        },
        not_found: {
          title: 'Search endpoint not found',
          message: 'The API route is missing. Check that the server is up to date.'
        },
        network_error: {
          title: "Can't reach the server",
          message: 'Check your connection and that the server is running.'
        },
        unknown: {
          title: 'Something went wrong',
          message: 'An unexpected error occurred. Try again.'
        }
      },

      more: 'More',
      less: 'Less',
      summaryLabel: 'Summary',
      authority3: 'Trusted source',
      authority4: 'Highly trusted',
      quality: 'High relevance',
      copyLink: 'Copy link',
      copied: 'Copied',
      copyFailed: 'Could not copy',

      footerNote: 'Powered by the DeepSeek Search API',
      footerHint: '{key} to search from anywhere',
      skipToResults: 'Skip to results',

      operators: [
        {
          key: 'site',
          label: 'site:',
          desc: 'Only results from one site',
          example: 'site:deepseek.com'
        },
        {
          key: 'excludeSite',
          label: '-site:',
          desc: 'Exclude one site',
          example: '-site:reddit.com'
        },
        {
          key: 'excludeTerm',
          label: '-',
          desc: 'Exclude a word',
          example: 'deepseek -release'
        },
        {
          key: 'excludePhrase',
          label: '-"…"',
          desc: 'Exclude an exact phrase',
          example: '-"press release"'
        },
        {
          key: 'exactPhrase',
          label: '"…"',
          desc: 'Match an exact phrase',
          example: '"context window"'
        },
        {
          key: 'lang',
          label: 'lang:',
          desc: 'Limit results to one language',
          example: 'lang:en'
        },
        {
          key: 'after',
          label: 'after:',
          desc: 'Published on or after a date',
          example: 'after:2025-01-01'
        },
        {
          key: 'before',
          label: 'before:',
          desc: 'Published before a date',
          example: 'before:2026-01-01'
        }
      ]
    },

    ja: {
      appName: 'DeepSeek Search',
      docTitleSearch: '“{query}” — DeepSeek Search',

      heroTitle: 'DeepSeek でウェブを検索',
      heroSubtitle: '静かで速く、根拠のある答えを。',

      searchLabel: '検索キーワード',
      searchPlaceholder: 'ウェブを検索…',
      searchSubmit: '検索',
      searchClear: '検索をクリア',
      resultLimitLabel: '検索ごとの結果件数',
      resultLimitUnit: '件',
      paginationLabel: '検索結果のページ',
      pagePrevious: '前へ',
      pageNext: '次へ',
      pageNumberLabel: '{page} ページ',
      pageStatus: '{page} / {pages} ページ',
      shortcutFocus: '{key} で検索フィールドに移動',

      themeLabel: '外観',
      themeSwitchToDark: 'ダーク外観に切り替え',
      themeSwitchToLight: 'ライト外観に切り替え',
      langLabel: '言語',

      helpButton: '検索構文のヘルプ',
      helpTitle: '検索構文',
      helpIntro: '演算子で絞り込み、キーワードと組み合わせて使えます。',
      helpOperatorsTitle: '演算子',
      helpClose: '閉じる',
      helpSetupTitle: 'API の設定',
      setupStep1: 'プロジェクトの .env ファイルを開きます。',
      setupStep2: '.env に次を追加します：',
      setupStep3: 'サーバーを再起動してページを再読み込みします。',
      setupDocs: 'DeepSeek 検索 API ガイドを開く',

      noticeTitle: 'API キーが未設定です',
      noticeBody: 'DEEPSEEK_API_KEY を .env に追加してサーバーを再起動すると、実際の結果を取得できます。',
      noticeOffline: '検索サービスに接続できません。サーバーが起動しているか確認してください。',
      noticeSetup: '設定方法',
      noticeDismiss: '通知を閉じる',

      demoBadge: 'デモデータ',
      demoBadgeTitle: 'モック結果です。実際の API は呼び出していません。',
      demoNoticeTitle: 'デモモード',
      demoNoticeBody: 'どの検索でも同じサンプル結果が返ります。',
      demoNoticeAction: '実際の検索を有効にする',
      scoreTitle: '再ランクスコア {score}',

      emptyTitle: '何でも検索',
      emptyHint: '質問を入力するか、例から始めてください。',
      suggestions: [
        'DeepSeek V4 リリースノート',
        'site:deepseek.com API ドキュメント',
        'lang:ja AI エージェント 評価',
        'after:2025 オープンソース LLM'
      ],

      resultsTitle: '検索結果',
      resultCountOne: '{count} 件',
      resultCountMany: '{count} 件',
      resultsFor: '「{query}」',
      elapsed: '{ms} ミリ秒',

      loading: '検索中…',
      loadingStatus: '「{query}」を検索中',
      noResultsTitle: '「{query}」の結果はありません',
      noResultsHint: 'キーワードを減らすか、site:・lang:・日付フィルターを緩めてください。',

      errorRetry: '再試行',
      errors: {
        missing_api_key: {
          title: 'API キーが必要です',
          message: 'DEEPSEEK_API_KEY を .env に追加してサーバーを再起動してください。'
        },
        invalid_request: {
          title: '検索内容が正しくありません',
          message: 'キーワードを確認して再試行してください。'
        },
        rate_limited: {
          title: 'リクエストが多すぎます',
          message: '少し待ってから再試行してください。'
        },
        upstream_error: {
          title: 'DeepSeek 検索を利用できません',
          message: '上流サービスでエラーが発生しました。しばらくして再試行してください。'
        },
        invalid_api_key: {
          title: 'API キーが無効です',
          message: '.env の DEEPSEEK_API_KEY を更新してサーバーを再起動してください。'
        },
        insufficient_balance: {
          title: '残高が不足しています',
          message: 'DeepSeek アカウントにチャージしてから再試行してください。'
        },
        forbidden: {
          title: 'リクエストが拒否されました',
          message: '検索サービスがこのリクエストを拒否しました。しばらくしてから再試行してください。'
        },
        payload_too_large: {
          title: '検索内容が長すぎます',
          message: '検索内容を短くして再試行してください。'
        },
        internal_error: {
          title: 'サーバーエラー',
          message: 'サーバーでエラーが発生しました。しばらくしてから再試行してください。'
        },
        timeout: {
          title: '検索がタイムアウトしました',
          message: 'サーバーの応答に時間がかかっています。再試行してください。'
        },
        not_found: {
          title: '検索エンドポイントが見つかりません',
          message: 'API ルートがありません。サーバーを確認してください。'
        },
        network_error: {
          title: 'サーバーに接続できません',
          message: '接続とサーバーの状態を確認してください。'
        },
        unknown: {
          title: '問題が発生しました',
          message: '予期しないエラーが発生しました。再試行してください。'
        }
      },

      more: '詳細',
      less: '閉じる',
      summaryLabel: '要約',
      authority3: '信頼できる情報源',
      authority4: '高い信頼性',
      quality: '関連性が高い',
      copyLink: 'リンクをコピー',
      copied: 'コピーしました',
      copyFailed: 'コピーできませんでした',

      footerNote: 'DeepSeek 検索 API を利用',
      footerHint: '{key} でどこからでも検索',
      skipToResults: '検索結果へスキップ',

      operators: [
        {
          key: 'site',
          label: 'site:',
          desc: '指定サイトの結果のみ',
          example: 'site:deepseek.com'
        },
        {
          key: 'excludeSite',
          label: '-site:',
          desc: '指定サイトを除外',
          example: '-site:reddit.com'
        },
        {
          key: 'excludeTerm',
          label: '-',
          desc: '単語を除外',
          example: 'deepseek -リリース'
        },
        {
          key: 'excludePhrase',
          label: '-"…"',
          desc: 'フレーズを除外',
          example: '-"プレスリリース"'
        },
        {
          key: 'exactPhrase',
          label: '"…"',
          desc: 'フレーズを完全一致',
          example: '"コンテキストウィンドウ"'
        },
        {
          key: 'lang',
          label: 'lang:',
          desc: '結果の言語を限定',
          example: 'lang:ja'
        },
        {
          key: 'after',
          label: 'after:',
          desc: 'この日付以降のページ',
          example: 'after:2025-01-01'
        },
        {
          key: 'before',
          label: 'before:',
          desc: 'この日付より前のページ',
          example: 'before:2026-01-01'
        }
      ]
    },

    ko: {
      appName: 'DeepSeek Search',
      docTitleSearch: '“{query}” — DeepSeek Search',

      heroTitle: 'DeepSeek으로 웹 검색',
      heroSubtitle: '조용하고 빠르게, 근거 있는 결과를.',

      searchLabel: '검색어',
      searchPlaceholder: '웹 검색…',
      searchSubmit: '검색',
      searchClear: '검색어 지우기',
      resultLimitLabel: '검색당 결과 수',
      resultLimitUnit: '개',
      paginationLabel: '검색 결과 페이지',
      pagePrevious: '이전',
      pageNext: '다음',
      pageNumberLabel: '{page}페이지',
      pageStatus: '{page} / {pages}페이지',
      shortcutFocus: '{key}로 검색창으로 이동',

      themeLabel: '화면 모드',
      themeSwitchToDark: '다크 모드로 전환',
      themeSwitchToLight: '라이트 모드로 전환',
      langLabel: '언어',

      helpButton: '검색 문법 도움말',
      helpTitle: '검색 문법',
      helpIntro: '연산자로 범위를 좁히고 키워드와 함께 사용하세요.',
      helpOperatorsTitle: '연산자',
      helpClose: '닫기',
      helpSetupTitle: 'API 설정',
      setupStep1: '프로젝트의 .env 파일을 엽니다.',
      setupStep2: '.env에 다음을 추가합니다:',
      setupStep3: '서버를 다시 시작하고 페이지를 새로고침합니다.',
      setupDocs: 'DeepSeek 검색 API 가이드 열기',

      noticeTitle: 'API 키가 설정되지 않았습니다',
      noticeBody: '.env에 DEEPSEEK_API_KEY를 추가하고 서버를 다시 시작하면 실시간 결과를 볼 수 있습니다.',
      noticeOffline: '검색 서비스에 연결할 수 없습니다. 서버가 실행 중인지 확인하세요.',
      noticeSetup: '설정 방법',
      noticeDismiss: '알림 닫기',

      demoBadge: '데모 데이터',
      demoBadgeTitle: '모의 결과이며 실제 API를 호출하지 않습니다.',
      demoNoticeTitle: '데모 모드',
      demoNoticeBody: '모든 검색어에 대해 동일한 예시 결과가 표시됩니다.',
      demoNoticeAction: '실제 검색 활성화',
      scoreTitle: '재순위 점수 {score}',

      emptyTitle: '무엇이든 검색하세요',
      emptyHint: '질문을 입력하거나 아래 예시로 시작하세요.',
      suggestions: [
        'DeepSeek V4 출시 노트',
        'site:deepseek.com API 문서',
        'lang:ko AI 에이전트 평가',
        'after:2025 오픈소스 LLM'
      ],

      resultsTitle: '검색 결과',
      resultCountOne: '{count}개',
      resultCountMany: '{count}개',
      resultsFor: '“{query}”',
      elapsed: '{ms}밀리초 소요',

      loading: '검색 중…',
      loadingStatus: '“{query}” 검색 중',
      noResultsTitle: '“{query}”에 대한 결과가 없습니다',
      noResultsHint: '키워드를 줄이거나 site:, lang:, 날짜 필터를 완화해 보세요.',

      errorRetry: '다시 시도',
      errors: {
        missing_api_key: {
          title: 'API 키가 필요합니다',
          message: '.env에 DEEPSEEK_API_KEY를 추가하고 서버를 다시 시작하세요.'
        },
        invalid_request: {
          title: '검색 요청이 올바르지 않습니다',
          message: '검색어를 확인한 후 다시 시도하세요.'
        },
        rate_limited: {
          title: '요청이 너무 많습니다',
          message: '잠시 후 다시 시도하세요.'
        },
        upstream_error: {
          title: 'DeepSeek 검색을 사용할 수 없습니다',
          message: '업스트림 서비스에서 오류가 발생했습니다. 잠시 후 다시 시도하세요.'
        },
        invalid_api_key: {
          title: 'API 키가 유효하지 않습니다',
          message: '.env의 DEEPSEEK_API_KEY를 업데이트하고 서버를 다시 시작하세요.'
        },
        insufficient_balance: {
          title: '잔액이 부족합니다',
          message: 'DeepSeek 계정에 충전한 후 다시 시도하세요.'
        },
        forbidden: {
          title: '요청이 차단되었습니다',
          message: '검색 서비스가 이 요청을 차단했습니다. 잠시 후 다시 시도하세요.'
        },
        payload_too_large: {
          title: '검색 내용이 너무 깁니다',
          message: '검색 내용을 줄인 후 다시 시도하세요.'
        },
        internal_error: {
          title: '서버 오류',
          message: '서버에서 오류가 발생했습니다. 잠시 후 다시 시도하세요.'
        },
        timeout: {
          title: '검색 시간이 초과되었습니다',
          message: '서버 응답이 너무 오래 걸립니다. 다시 시도하세요.'
        },
        not_found: {
          title: '검색 엔드포인트를 찾을 수 없습니다',
          message: 'API 경로가 없습니다. 서버 상태를 확인하세요.'
        },
        network_error: {
          title: '서버에 연결할 수 없습니다',
          message: '연결과 서버 상태를 확인하세요.'
        },
        unknown: {
          title: '문제가 발생했습니다',
          message: '예기치 않은 오류가 발생했습니다. 다시 시도하세요.'
        }
      },

      more: '자세히',
      less: '접기',
      summaryLabel: '요약',
      authority3: '신뢰할 수 있는 출처',
      authority4: '매우 신뢰할 수 있는 출처',
      quality: '높은 관련성',
      copyLink: '링크 복사',
      copied: '복사됨',
      copyFailed: '복사하지 못했습니다',

      footerNote: 'DeepSeek 검색 API 제공',
      footerHint: '{key}로 어디서나 검색',
      skipToResults: '검색 결과로 이동',

      operators: [
        {
          key: 'site',
          label: 'site:',
          desc: '지정한 사이트의 결과만',
          example: 'site:deepseek.com'
        },
        {
          key: 'excludeSite',
          label: '-site:',
          desc: '지정한 사이트 제외',
          example: '-site:reddit.com'
        },
        {
          key: 'excludeTerm',
          label: '-',
          desc: '단어 제외',
          example: 'deepseek -출시'
        },
        {
          key: 'excludePhrase',
          label: '-"…"',
          desc: '정확한 문구 제외',
          example: '-"보도자료"'
        },
        {
          key: 'exactPhrase',
          label: '"…"',
          desc: '정확한 문구 일치',
          example: '"컨텍스트 창"'
        },
        {
          key: 'lang',
          label: 'lang:',
          desc: '결과 언어 제한',
          example: 'lang:ko'
        },
        {
          key: 'after',
          label: 'after:',
          desc: '이 날짜 이후 페이지',
          example: 'after:2025-01-01'
        },
        {
          key: 'before',
          label: 'before:',
          desc: '이 날짜 이전 페이지',
          example: 'before:2026-01-01'
        }
      ]
    }
  };

  var PLACEHOLDER = /\{(\w+)\}/g;

  function interpolate(template, vars) {
    if (!vars) return template;
    return template.replace(PLACEHOLDER, function (match, name) {
      return Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match;
    });
  }

  function normalizeLanguage(tag) {
    if (!tag || typeof tag !== 'string') return null;
    var clean = tag.trim();
    if (!clean) return null;
    for (var i = 0; i < SUPPORTED.length; i += 1) {
      if (SUPPORTED[i].toLowerCase() === clean.toLowerCase()) return SUPPORTED[i];
    }
    var base = clean.toLowerCase().split(/[-_]/)[0];
    if (base === 'zh') return 'zh-CN';
    if (base === 'en') return 'en';
    if (base === 'ja') return 'ja';
    if (base === 'ko') return 'ko';
    return null;
  }

  function getDictionary(lang) {
    return dictionaries[lang] || dictionaries[DEFAULT];
  }

  function t(lang, key, vars) {
    var dictionary = getDictionary(lang);
    var value = dictionary[key];
    if (value === undefined || value === null) {
      value = dictionaries[DEFAULT][key];
    }
    if (typeof value === 'string') {
      return interpolate(value, vars);
    }
    return value;
  }

  function browserLanguage() {
    var candidates = [];
    if (Array.isArray(global.navigator && global.navigator.languages)) {
      candidates = global.navigator.languages.slice();
    }
    if (global.navigator && global.navigator.language) {
      candidates.push(global.navigator.language);
    }
    for (var i = 0; i < candidates.length; i += 1) {
      var normalized = normalizeLanguage(candidates[i]);
      if (normalized) return normalized;
    }
    return DEFAULT;
  }

  global.DS_I18N = {
    supported: SUPPORTED.slice(),
    defaultLanguage: DEFAULT,
    langNames: LANG_NAMES,
    dictionaries: dictionaries,
    normalizeLanguage: normalizeLanguage,
    browserLanguage: browserLanguage,
    t: t
  };
})(window);