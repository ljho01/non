import { createContext, useContext, useMemo, type ReactNode } from 'react'

export const appLanguages = ['ko', 'en', 'zh-CN', 'es', 'hi', 'ar'] as const
export type AppLanguage = (typeof appLanguages)[number]

export const languageNames: Record<AppLanguage, string> = {
  ko: '한국어',
  en: 'English',
  'zh-CN': '简体中文',
  es: 'Español',
  hi: 'हिन्दी',
  ar: 'العربية',
}

type Variables = Record<string, string | number>
type Messages = Record<string, string>

const en: Messages = {
  settings: 'Settings', general: 'General', 'AI 계정': 'AI accounts', 스킬: 'Skills',
  '데이터 및 기억': 'Data & memory', '앱 정보': 'About', 돌아가기: 'Back',
  '설정 항목': 'Settings sections', '내 기기의 개인 공간': 'Your private space on this device',
  화면: 'Appearance', 테마: 'Theme', 'Non의 화면 스타일을 선택하세요.': 'Choose how Non looks.',
  '시스템 설정 사용': 'Use system setting', 라이트: 'Light', 다크: 'Dark', 시스템: 'System',
  '테마 미리보기': 'Theme preview', 언어: 'Language',
  '앱에서 사용할 언어를 선택하세요.': 'Choose the language used in the app.', 레이아웃: 'Layout',
  사이드바: 'Sidebar', '폴더와 노트 탐색을 표시합니다.': 'Show folder and note navigation.',
  'AI 패널': 'AI panel', '문서 옆에서 대화를 이어갑니다.': 'Continue conversations beside your document.',
  연결: 'Connections', 연결됨: 'Connected', '연결되지 않음': 'Not connected',
  '다시 연결': 'Reconnect', '연결 해제': 'Disconnect', 취소: 'Cancel', 확인: 'Confirm',
  '로그인 페이지 다시 열기': 'Reopen sign-in page', '로그인 후 리디렉션 URL 붙여넣기': 'Paste the redirect URL after signing in',
  '모델 및 권한': 'Models & permissions', '기본 모델': 'Default model',
  '연결된 구독 또는 API 키에서 사용할 모델입니다.': 'The model to use from a connected subscription or API key.',
  'AI 계정을 먼저 연결하세요': 'Connect an AI account first', 이미지: 'Image',
  '에이전트 샌드박스': 'Agent sandbox',
  '켜면 파일 읽기와 쓰기를 문서/non 내부로 제한합니다.': 'When on, file access is limited to Documents/non.',
  '끄면 이 Mac의 다른 경로에도 접근할 수 있습니다.': 'When off, the agent can access other locations on this Mac.',
  관리: 'Manage', '폴더 열기': 'Open folder', '폴더에서 설치': 'Install from folder',
  '설치된 스킬': 'Installed skills', 활성: 'Enabled', 비활성: 'Disabled', '기본 제공': 'Built in',
  '스킬 확인 중…': 'Checking skills…', '설치된 스킬이 없습니다.': 'No skills installed.',
  문서: 'Documents', '문서 폴더': 'Documents folder', '문서/non을 여는 중입니다.': 'Opening Documents/non…',
  '로컬 우선 저장': 'Local-first storage', 기억: 'Memory', '기억 관리': 'Manage memory',
  '보관된 항목': 'Archived items', 복구: 'Restore', '영구 삭제': 'Delete permanently',
  '체크리스트': 'Checklist', 'Task 페이지에 모이는 할 일': 'Items collected on the Task page',
  '할 일 불러오는 중…': 'Loading tasks…', '할 일이 없습니다.': 'No tasks.', '빈 할 일': 'Untitled task',
  '읽지 못한 문서': 'Could not read documents', '저장하지 못했습니다.': 'Could not save.',
  '보관된 항목 확인 중…': 'Checking archived items…', '보관된 항목이 없습니다.': 'No archived items.',
  '보관한 항목은 파일 탐색기에서 숨겨집니다. 복구하면 원래 위치로 돌아가며, 영구 삭제한 항목은 되돌릴 수 없습니다.':
    'Archived items are hidden from the file browser. Restore returns them to their original location; permanent deletion cannot be undone.',
  '이 항목과 그 내용을 완전히 삭제합니다. 이 작업은 되돌릴 수 없습니다.':
    'This permanently deletes the item and its contents. This action cannot be undone.',
  앱: 'App', 버전: 'Version', '실행 환경': 'Runtime', '개발 빌드': 'development build',
  삭제: 'Delete',
  '노트를 쓰고, PDF를 읽고, AI와 생각을 이어가세요.': 'Write notes, read PDFs, and keep thinking with AI.',
  '문서 찾기': 'Find documents', '새 노트': 'New note', '새 캔버스': 'New canvas', '새 전사': 'New transcription',
  '최근 항목': 'Recent', 즐겨찾기: 'Favorites', 파일: 'Files', '첫 노트를 만들거나': 'Create your first note or',
  '즐겨찾기에 추가': 'Add to favorites', '즐겨찾기에서 제거': 'Remove from favorites',
  '항목을 우클릭해 즐겨찾기에 추가하세요.': 'Right-click an item to add it to favorites.',
  'PDF를 가져와 보세요.': 'import a PDF.', '기본 문서 폴더를 열지 못했습니다.': 'Could not open the default documents folder.',
  '폴더를 여는 중입니다.': 'Opening folder…', '새 JSON 노트': 'New JSON note', '새 Markdown': 'New Markdown note',
  'PDF 가져오기': 'Import PDF', '오디오 전사': 'Transcribe audio', 설정: 'Settings',
  '새 문서 형식': 'New document format', 'JSON 노트': 'JSON note', 기본: 'Default', 캔버스: 'Canvas',
  'JSON 문서': 'JSON document', 'Markdown 문서': 'Markdown document', 폴더: 'Folder', 열기: 'Open',
  'Finder에서 보기': 'Show in Finder', '이름 바꾸기': 'Rename', 보관: 'Archive',
  '새 대화': 'New chat', '대화 기록': 'Chat history', '이 폴더의 대화': 'Chats in this folder',
  '저장된 대화가 없습니다.': 'No saved chats.', '대화 불러오는 중': 'Loading conversation…',
  '답변 작성 중': 'Writing response…', '생각하는 중': 'Thinking…',
  '질문하거나, 생각을 적어 보세요…': 'Ask a question or write down a thought…',
  '먼저 폴더를 추가해 주세요': 'Add a folder first', '이미지 첨부': 'Attach image',
  '현재 문서 첨부': 'Attach current document', 'AI 모델': 'AI model', '모델 선택': 'Select model',
  'AI 계정 연결': 'Connect AI account', '메시지 보내기': 'Send message', '응답 중지': 'Stop response',
  '현재 모델은 이미지를 지원하지 않음': 'Current model does not support images',
  '새 전사 세션': 'New transcription session', '오디오 입력과 언어를 선택하세요.': 'Choose an audio input and language.',
  입력: 'Input', '실시간 마이크': 'Live microphone', '마이크 입력을 들으며 자막을 바로 표시합니다.': 'Listen to the microphone and show captions live.',
  '오디오 파일': 'Audio file', '녹음 파일을 실시간 속도로 전사합니다.': 'Transcribe a recording at real-time speed.',
  '음성 언어': 'Spoken language', '현재 로컬 live 프로필은 한국어와 영어를 지원합니다.': 'The local live profile currently supports Korean and English.',
  '실시간 전사 시작': 'Start live transcription', '파일 선택': 'Choose file', 한국어: 'Korean',
  '이전 페이지': 'Previous page', '다음 페이지': 'Next page', 축소: 'Zoom out', 확대: 'Zoom in', 'PDF 읽는 중': 'Loading PDF…',
  '기억 검색': 'Search memory', '기억 추가': 'Add memory', '저장 범위': 'Storage scope', 저장: 'Save', 휴지통: 'Trash',
  '아직 기억이 없습니다. 직접 추가하거나 대화 중 기억해 달라고 요청하세요.': 'No memories yet. Add one directly or ask AI to remember something.',
  '전역 (기본 · 모든 폴더 공통)': 'Global (default · all folders)', '폴더 루트': 'Folder root',
  '저장하지 않은 편집을 버릴까요?': 'Discard unsaved edits?', '계속 편집': 'Keep editing', '변경사항 버리기': 'Discard changes',
  '제목이나 본문을 입력하세요.': 'Enter a title or body text.', '현재 폴더의 제목과 본문을 검색합니다.': 'Search titles and body text in this folder.',
  '먼저 폴더를 추가하세요.': 'Add a folder first.', '검색 중…': 'Searching…', '검색 결과가 없습니다.': 'No results found.',
  '문서 검색': 'Search documents', '검색 결과': 'Search results', 이동: 'Move', 닫기: 'Close',
  '문서 연결': 'Document links', 백링크: 'Backlinks', '나가는 링크': 'Outgoing links',
  '이 문서를 가리키는 링크': 'Links to this document', '아직 백링크가 없습니다.': 'No backlinks yet.',
  '이 문서에서 나가는 링크': 'Links from this document',
  '배경 변경': 'Change cover', '배경 추가': 'Add cover', '문서 배경': 'Document cover', '배경 제거': 'Remove cover',
  '노트 제목': 'Note title', '제목 없음': 'Untitled', '블록 명령': 'Block commands',
  '일치하는 블록이 없습니다.': 'No matching blocks.', '연결할 문서 검색': 'Search documents to link',
  '제목 또는 본문 검색…': 'Search title or body…', '복사본 저장': 'Save a copy',
  '원본을 변경하지 않았습니다.': 'The original was not changed.', 'AI에게 메시지': 'Message AI',
  텍스트: 'Text', '일반 문단으로 작성': 'Write a regular paragraph', '제목 1': 'Heading 1', '큰 구역 제목': 'Large section heading',
  '제목 2': 'Heading 2', '중간 구역 제목': 'Medium section heading', '제목 3': 'Heading 3', '작은 구역 제목': 'Small section heading',
  '글머리 목록': 'Bulleted list', '순서 없는 목록': 'Unordered list', '번호 목록': 'Numbered list', '순서가 있는 목록': 'Ordered list',
  '할 일 목록': 'Task list', '체크할 수 있는 항목': 'Checkable items', 인용: 'Quote', '인용문 블록': 'Quote block',
  '코드 블록': 'Code block', '여러 줄 코드': 'Multi-line code', 구분선: 'Divider', '내용 사이를 나누는 선': 'A line between sections',
  '문서 링크': 'Document link', '다른 노트나 PDF 연결': 'Link another note or PDF',
  '기억을 저장했습니다.': 'Memory saved.',
  '전사 중': 'Transcribing', '준비 중': 'Preparing', '마무리 중': 'Finalizing', '녹음 중': 'Recording',
  '전사 탭 열기': 'Open transcription tab', '전사 중지': 'Stop transcription',
  '런타임 대기': 'Waiting for runtime', '대기 중': 'Queued', '모델 준비 중': 'Preparing model', '문장 정리 중': 'Finalizing text',
  완료: 'Completed', 중지됨: 'Stopped', 오류: 'Error', 설치: 'Install', '오디오 일시 정지': 'Pause audio', '오디오 재생': 'Play audio',
  '듣는 중': 'Listening', '세션 종료': 'Session ended', '준비가 끝나면 입력을 시작합니다.': 'Input will begin when setup is complete.', 처리됨: 'processed',
  '전사 세션을 찾을 수 없습니다.': 'Transcription session not found.', '로컬 전사 세션': 'Local transcription session', 중지: 'Stop', 재전사: 'Retranscribe', '전사 시작': 'Start transcription',
  '첫 설치에는 모델 다운로드와 q8 변환이 필요해 시간이 걸릴 수 있습니다.': 'The first setup downloads and converts the model to q8, which may take some time.',
  '화면, AI 계정, 로컬 데이터와 기억 설정': 'Appearance, AI accounts, local data, and memory settings',
  'ChatGPT 구독으로 지원되는 Codex 모델을 사용합니다.': 'Use supported Codex models with your ChatGPT subscription.', 'ChatGPT로 로그인': 'Sign in with ChatGPT',
  'Claude 구독을 연결하고 지원되는 Claude 모델을 사용합니다.': 'Connect a Claude subscription and use supported Claude models.', 'Claude로 로그인': 'Sign in with Claude',
  'OpenAI API 키': 'OpenAI API key', '본인 OpenAI API 키로 사용량을 직접 결제합니다.': 'Pay directly for usage with your OpenAI API key.',
  'Anthropic API 키': 'Anthropic API key', '본인 Anthropic API 키로 사용량을 직접 결제합니다.': 'Pay directly for usage with your Anthropic API key.', 'API 키 설정': 'Set API key',
  '에이전트가 문서/non 밖의 파일을 읽고 생성하거나 수정할 수 있습니다. 셸 실행은 허용되지 않으며, 읽은 내용은 선택한 AI 제공자에 전송될 수 있습니다.': 'The agent may read, create, or modify files outside Documents/non. Shell access remains disabled, and read content may be sent to your selected AI provider.',
  '인증 정보는 macOS 보안 저장소로 암호화되어 이 기기에만 보관됩니다. API 키는 React 화면이나 문서 폴더, iCloud로 전달되지 않습니다.': 'Credentials are encrypted in macOS secure storage and kept on this device. API keys are never passed to the React UI, documents folder, or iCloud.',
  '작업별 지침을 담은 SKILL.md 폴더를 설치합니다. 스킬은 이 기기의 Application Support에 저장되며 문서 폴더나 iCloud에 들어가지 않습니다.': 'Install SKILL.md folders with task-specific instructions. Skills stay in Application Support on this device, not in Documents or iCloud.',
  '활성화한 스킬의 설명은 AI에 표시되며, 관련 작업에서는 지침과 참조 텍스트를 선택한 AI 제공자에게 전송할 수 있습니다. 스킬 자체는 코드를 실행하지 않습니다.': 'Enabled skill descriptions are shown to AI. Relevant instructions and reference text may be sent to your selected provider. Skills do not execute code themselves.',
  '노트는 확장 가능한 JSON, PDF는 원본 파일로 보관합니다.': 'Notes are stored as extensible JSON and PDFs as original files.',
  'JSON 노트와 Markdown을 작성·편집하고 PDF를 읽을 수 있습니다.': 'Create and edit JSON notes and Markdown, and read PDFs.',
  'iCloud 폴더를 선택하면 macOS가 문서와 폴더 기억을 동기화합니다.': 'When you choose an iCloud folder, macOS syncs documents and folder memories.',
  '전역 기억은 현재 기기 로컬이며 자동 동기화되지 않습니다.': 'Global memories remain local to this device and are not synced automatically.',
  '기본은 전역 기억이며, 폴더 기억은 하위 폴더로 상속됩니다.': 'Memories are global by default; folder memories are inherited by subfolders.',
  '여러 기기에서 동시에 편집한 변경 사항은 자동 병합되지 않습니다. 저장 충돌이 감지되면 편집 내용을 복사본으로 보존할 수 있습니다.': 'Simultaneous edits from multiple devices are not merged automatically. If a save conflict is detected, your edits can be preserved as a copy.',
  '데스크톱 전용 앱입니다. 문서와 기억은 사용자 소유의 로컬 파일로 저장됩니다.': 'This is a desktop-only app. Documents and memories are stored as local files you own.',
  '스킬을 비활성화하고 설치 폴더를 휴지통으로 이동합니다.': 'Disable the skill and move its installation folder to Trash.',
  전역: 'Global', '상위 폴더': 'Parent folders', '현재 위치에 적용되는 기억입니다.': 'These memories apply to the current location.',
  '전역 기억은 추가한 모든 폴더에서 공통으로 사용됩니다.': 'Global memories are shared across all folders you add.',
  '기억 내용': 'Memory content', '# 기억 제목\n\nAI가 기억할 내용을 적어 주세요.': '# Memory title\n\nWrite what AI should remember.',
  '해당 범위의 휴지통으로 옮겼습니다. 파일을 복원할 수 있습니다.': 'Moved to Trash for this scope. You can restore the file.',
  '전역 기억은 이 기기의 앱 데이터에 저장됩니다. iCloud 자동 동기화 대상이 아닙니다.': 'Global memories are stored in app data on this device and are not automatically synced with iCloud.',
  '폴더 기억은 해당 폴더의 .non/memory/에 저장되며 하위 폴더에 상속됩니다.': 'Folder memories are stored in .non/memory and inherited by subfolders.',
  '현재 기억에 입력한 변경사항은 복구할 수 없습니다.': 'Changes entered in this memory cannot be recovered.',
}

const zhCN: Messages = {
  ...en,
  settings: '设置', general: '通用', 'AI 계정': 'AI 账户', 스킬: '技能', '데이터 및 기억': '数据与记忆', '앱 정보': '关于', 돌아가기: '返回',
  '설정 항목': '设置项目', '내 기기의 개인 공간': '此设备上的私人空间', 화면: '外观', 테마: '主题',
  'Non의 화면 스타일을 선택하세요.': '选择 Non 的外观。', '시스템 설정 사용': '跟随系统', 라이트: '浅色', 다크: '深色', 시스템: '系统',
  '테마 미리보기': '主题预览', 언어: '语言', '앱에서 사용할 언어를 선택하세요.': '选择应用使用的语言。', 레이아웃: '布局',
  사이드바: '侧边栏', '폴더와 노트 탐색을 표시합니다.': '显示文件夹和笔记导航。', 'AI 패널': 'AI 面板',
  '문서 옆에서 대화를 이어갑니다.': '在文档旁继续对话。', 연결: '连接', 연결됨: '已连接', '연결되지 않음': '未连接',
  '다시 연결': '重新连接', '연결 해제': '断开连接', 취소: '取消', 확인: '确定', '로그인 페이지 다시 열기': '重新打开登录页',
  '모델 및 권한': '模型与权限', '기본 모델': '默认模型', '연결된 구독 또는 API 키에서 사용할 모델입니다.': '从已连接的订阅或 API 密钥中选择模型。',
  'AI 계정을 먼저 연결하세요': '请先连接 AI 账户', 이미지: '图像', '에이전트 샌드박스': '智能体沙盒', 관리: '管理',
  '폴더 열기': '打开文件夹', '폴더에서 설치': '从文件夹安装', '설치된 스킬': '已安装技能', 활성: '启用', 비활성: '停用', '기본 제공': '内置',
  '스킬 확인 중…': '正在检查技能…', '설치된 스킬이 없습니다.': '没有已安装的技能。', 문서: '文档', '문서 폴더': '文档文件夹',
  '문서/non을 여는 중입니다.': '正在打开 Documents/non…', '로컬 우선 저장': '本地优先存储', 기억: '记忆', '기억 관리': '管理记忆',
  '보관된 항목': '已归档项目', 복구: '恢复', '영구 삭제': '永久删除', '보관된 항목 확인 중…': '正在检查归档…', '보관된 항목이 없습니다.': '没有归档项目。',
  앱: '应用', 버전: '版本', '실행 환경': '运行环境', '개발 빌드': '开发版本', 삭제: '删除',
  '노트를 쓰고, PDF를 읽고, AI와 생각을 이어가세요.': '写笔记、阅读 PDF，并与 AI 一起思考。',
  '문서 찾기': '查找文档', '새 노트': '新建笔记', '새 캔버스': '新建画布', '새 전사': '新建转录', '최근 항목': '最近', 파일: '文件',
  '첫 노트를 만들거나': '创建第一篇笔记或', 'PDF를 가져와 보세요.': '导入 PDF。', '기본 문서 폴더를 열지 못했습니다.': '无法打开默认文档文件夹。',
  '폴더를 여는 중입니다.': '正在打开文件夹…', '새 JSON 노트': '新建 JSON 笔记', '새 Markdown': '新建 Markdown', 'PDF 가져오기': '导入 PDF', '오디오 전사': '音频转录',
  설정: '设置', '새 문서 형식': '新文档格式', 'JSON 노트': 'JSON 笔记', 기본: '默认', 캔버스: '画布', 'JSON 문서': 'JSON 文档', 'Markdown 문서': 'Markdown 文档', 폴더: '文件夹', 열기: '打开',
  'Finder에서 보기': '在 Finder 中显示', '이름 바꾸기': '重命名', 보관: '归档', '새 대화': '新对话', '대화 기록': '对话记录', '이 폴더의 대화': '此文件夹中的对话',
  '저장된 대화가 없습니다.': '没有已保存的对话。', '대화 불러오는 중': '正在加载对话…', '답변 작성 중': '正在撰写回复…', '생각하는 중': '思考中…',
  '질문하거나, 생각을 적어 보세요…': '提问或写下想法…', '먼저 폴더를 추가해 주세요': '请先添加文件夹', '이미지 첨부': '附加图像', '현재 문서 첨부': '附加当前文档',
  'AI 모델': 'AI 模型', '모델 선택': '选择模型', 'AI 계정 연결': '连接 AI 账户', '메시지 보내기': '发送消息', '응답 중지': '停止回复',
  '새 전사 세션': '新建转录会话', '오디오 입력과 언어를 선택하세요.': '选择音频输入和语言。', 입력: '输入', '실시간 마이크': '实时麦克风',
  '마이크 입력을 들으며 자막을 바로 표시합니다.': '监听麦克风并实时显示字幕。', '오디오 파일': '音频文件', '녹음 파일을 실시간 속도로 전사합니다.': '以实时速度转录录音。',
  '음성 언어': '语音语言', '실시간 전사 시작': '开始实时转录', '파일 선택': '选择文件', 한국어: '韩语', '이전 페이지': '上一页', '다음 페이지': '下一页', 축소: '缩小', 확대: '放大', 'PDF 읽는 중': '正在加载 PDF…',
  '기억 검색': '搜索记忆', '기억 추가': '添加记忆', '저장 범위': '存储范围', 저장: '保存', 휴지통: '废纸篓', '문서 검색': '搜索文档', '검색 결과': '搜索结果', 이동: '移动', 닫기: '关闭',
  '검색 중…': '搜索中…', '검색 결과가 없습니다.': '没有搜索结果。', '문서 연결': '文档链接', 백링크: '反向链接', '나가는 링크': '传出链接',
  '배경 변경': '更换封面', '배경 추가': '添加封面', '문서 배경': '文档封面', '배경 제거': '移除封面', '노트 제목': '笔记标题', '제목 없음': '无标题',
  '블록 명령': '块命令', '일치하는 블록이 없습니다.': '没有匹配的块。', '연결할 문서 검색': '搜索要链接的文档', '제목 또는 본문 검색…': '搜索标题或正文…', '복사본 저장': '保存副本',
  '전사 중': '转录中', '준비 중': '准备中', '마무리 중': '正在完成', '녹음 중': '录音中', '전사 탭 열기': '打开转录标签页', '전사 중지': '停止转录',
}

const es: Messages = {
  ...en, settings: 'Configuración', general: 'General', 'AI 계정': 'Cuentas de IA', 스킬: 'Habilidades', '데이터 및 기억': 'Datos y memoria', '앱 정보': 'Acerca de', 돌아가기: 'Volver',
  화면: 'Apariencia', 테마: 'Tema', '시스템 설정 사용': 'Usar configuración del sistema', 라이트: 'Claro', 다크: 'Oscuro', 시스템: 'Sistema', 언어: 'Idioma',
  '앱에서 사용할 언어를 선택하세요.': 'Elige el idioma de la aplicación.', 레이아웃: 'Diseño', 사이드바: 'Barra lateral', 연결: 'Conexiones', 연결됨: 'Conectado', '연결되지 않음': 'Sin conectar',
  '다시 연결': 'Volver a conectar', '연결 해제': 'Desconectar', 취소: 'Cancelar', 확인: 'Confirmar', 관리: 'Gestionar', 문서: 'Documentos', 기억: 'Memoria',
  복구: 'Restaurar', '영구 삭제': 'Eliminar permanentemente', 앱: 'Aplicación', 버전: 'Versión', 삭제: 'Eliminar',
  '문서 찾기': 'Buscar documentos', '새 노트': 'Nueva nota', '새 캔버스': 'Nuevo lienzo', '새 전사': 'Nueva transcripción', '최근 항목': 'Recientes', 파일: 'Archivos',
  '폴더를 여는 중입니다.': 'Abriendo carpeta…', '새 JSON 노트': 'Nueva nota JSON', '새 Markdown': 'Nuevo Markdown', 'PDF 가져오기': 'Importar PDF', '오디오 전사': 'Transcribir audio',
  설정: 'Configuración', 캔버스: 'Lienzo', 폴더: 'Carpeta', 열기: 'Abrir', '이름 바꾸기': 'Renombrar', 보관: 'Archivar', '새 대화': 'Nuevo chat', '대화 기록': 'Historial',
  '저장된 대화가 없습니다.': 'No hay conversaciones guardadas.', '대화 불러오는 중': 'Cargando conversación…', '답변 작성 중': 'Escribiendo respuesta…', '생각하는 중': 'Pensando…',
  '질문하거나, 생각을 적어 보세요…': 'Haz una pregunta o escribe una idea…', '먼저 폴더를 추가해 주세요': 'Añade una carpeta primero', '이미지 첨부': 'Adjuntar imagen',
  '현재 문서 첨부': 'Adjuntar documento actual', 'AI 모델': 'Modelo de IA', '모델 선택': 'Elegir modelo', 'AI 계정 연결': 'Conectar cuenta de IA', '메시지 보내기': 'Enviar mensaje', '응답 중지': 'Detener respuesta',
  '새 전사 세션': 'Nueva sesión de transcripción', '오디오 입력과 언어를 선택하세요.': 'Elige una entrada de audio y un idioma.', 입력: 'Entrada', '실시간 마이크': 'Micrófono en directo',
  '오디오 파일': 'Archivo de audio', '음성 언어': 'Idioma hablado', '실시간 전사 시작': 'Iniciar transcripción', '파일 선택': 'Elegir archivo', 한국어: 'Coreano',
  '이전 페이지': 'Página anterior', '다음 페이지': 'Página siguiente', 축소: 'Alejar', 확대: 'Acercar', 'PDF 읽는 중': 'Cargando PDF…', '검색 중…': 'Buscando…', '검색 결과가 없습니다.': 'No hay resultados.',
  '기억 검색': 'Buscar memoria', '기억 추가': 'Añadir memoria', '저장 범위': 'Ámbito', 저장: 'Guardar', 휴지통: 'Papelera', '문서 검색': 'Buscar documentos', '검색 결과': 'Resultados', 이동: 'Mover', 닫기: 'Cerrar',
  '문서 연결': 'Enlaces del documento', 백링크: 'Enlaces entrantes', '나가는 링크': 'Enlaces salientes', '배경 변경': 'Cambiar portada', '배경 추가': 'Añadir portada', '문서 배경': 'Portada', '배경 제거': 'Quitar portada',
  '노트 제목': 'Título de la nota', '제목 없음': 'Sin título', '블록 명령': 'Comandos de bloque', '일치하는 블록이 없습니다.': 'No hay bloques coincidentes.', '복사본 저장': 'Guardar una copia',
  '전사 중': 'Transcribiendo', '준비 중': 'Preparando', '마무리 중': 'Finalizando', '녹음 중': 'Grabando', '전사 탭 열기': 'Abrir transcripción', '전사 중지': 'Detener transcripción',
}

const hi: Messages = {
  ...en, settings: 'सेटिंग्स', general: 'सामान्य', 'AI 계정': 'AI खाते', 스킬: 'कौशल', '데이터 및 기억': 'डेटा और स्मृति', '앱 정보': 'ऐप के बारे में', 돌아가기: 'वापस',
  화면: 'दिखावट', 테마: 'थीम', '시스템 설정 사용': 'सिस्टम सेटिंग का उपयोग करें', 라이트: 'लाइट', 다크: 'डार्क', 시스템: 'सिस्टम', 언어: 'भाषा',
  '앱에서 사용할 언어를 선택하세요.': 'ऐप की भाषा चुनें।', 레이아웃: 'लेआउट', 사이드바: 'साइडबार', 연결: 'कनेक्शन', 연결됨: 'कनेक्टेड', '연결되지 않음': 'कनेक्ट नहीं है',
  '다시 연결': 'फिर कनेक्ट करें', '연결 해제': 'डिस्कनेक्ट करें', 취소: 'रद्द करें', 확인: 'पुष्टि करें', 관리: 'प्रबंधित करें', 문서: 'दस्तावेज़', 기억: 'स्मृति',
  복구: 'पुनर्स्थापित करें', '영구 삭제': 'स्थायी रूप से हटाएँ', 앱: 'ऐप', 버전: 'संस्करण', 삭제: 'हटाएँ',
  '문서 찾기': 'दस्तावेज़ खोजें', '새 노트': 'नया नोट', '새 캔버스': 'नया कैनवास', '새 전사': 'नया ट्रांसक्रिप्शन', '최근 항목': 'हाल के', 파일: 'फ़ाइलें',
  '폴더를 여는 중입니다.': 'फ़ोल्डर खुल रहा है…', '새 JSON 노트': 'नया JSON नोट', '새 Markdown': 'नया Markdown', 'PDF 가져오기': 'PDF आयात करें', '오디오 전사': 'ऑडियो ट्रांसक्राइब करें',
  설정: 'सेटिंग्स', 캔버스: 'कैनवास', 폴더: 'फ़ोल्डर', 열기: 'खोलें', '이름 바꾸기': 'नाम बदलें', 보관: 'आर्काइव करें', '새 대화': 'नई चैट', '대화 기록': 'चैट इतिहास',
  '저장된 대화가 없습니다.': 'कोई सहेजी गई चैट नहीं है।', '대화 불러오는 중': 'बातचीत लोड हो रही है…', '답변 작성 중': 'उत्तर लिखा जा रहा है…', '생각하는 중': 'सोच रहा है…',
  '질문하거나, 생각을 적어 보세요…': 'सवाल पूछें या विचार लिखें…', '먼저 폴더를 추가해 주세요': 'पहले फ़ोल्डर जोड़ें', '이미지 첨부': 'छवि संलग्न करें',
  '현재 문서 첨부': 'वर्तमान दस्तावेज़ संलग्न करें', 'AI 모델': 'AI मॉडल', '모델 선택': 'मॉडल चुनें', 'AI 계정 연결': 'AI खाता कनेक्ट करें', '메시지 보내기': 'संदेश भेजें', '응답 중지': 'उत्तर रोकें',
  '새 전사 세션': 'नया ट्रांसक्रिप्शन सत्र', '오디오 입력과 언어를 선택하세요.': 'ऑडियो इनपुट और भाषा चुनें।', 입력: 'इनपुट', '실시간 마이크': 'लाइव माइक्रोफ़ोन',
  '오디오 파일': 'ऑडियो फ़ाइल', '음성 언어': 'बोली की भाषा', '실시간 전사 시작': 'लाइव ट्रांसक्रिप्शन शुरू करें', '파일 선택': 'फ़ाइल चुनें', 한국어: 'कोरियाई',
  '이전 페이지': 'पिछला पृष्ठ', '다음 페이지': 'अगला पृष्ठ', 축소: 'ज़ूम आउट', 확대: 'ज़ूम इन', 'PDF 읽는 중': 'PDF लोड हो रही है…', '검색 중…': 'खोज रहा है…', '검색 결과가 없습니다.': 'कोई परिणाम नहीं।',
  '기억 검색': 'स्मृति खोजें', '기억 추가': 'स्मृति जोड़ें', '저장 범위': 'संग्रह सीमा', 저장: 'सहेजें', 휴지통: 'ट्रैश', '문서 검색': 'दस्तावेज़ खोजें', '검색 결과': 'खोज परिणाम', 이동: 'स्थानांतरित करें', 닫기: 'बंद करें',
  '문서 연결': 'दस्तावेज़ लिंक', 백링크: 'बैकलिंक', '나가는 링크': 'बाहर जाने वाले लिंक', '배경 변경': 'कवर बदलें', '배경 추가': 'कवर जोड़ें', '문서 배경': 'दस्तावेज़ कवर', '배경 제거': 'कवर हटाएँ',
  '노트 제목': 'नोट शीर्षक', '제목 없음': 'शीर्षकहीन', '블록 명령': 'ब्लॉक कमांड', '일치하는 블록이 없습니다.': 'कोई मेल खाता ब्लॉक नहीं।', '복사본 저장': 'कॉपी सहेजें',
  '전사 중': 'ट्रांसक्राइब हो रहा है', '준비 중': 'तैयारी हो रही है', '마무리 중': 'पूरा हो रहा है', '녹음 중': 'रिकॉर्डिंग', '전사 탭 열기': 'ट्रांसक्रिप्शन खोलें', '전사 중지': 'ट्रांसक्रिप्शन रोकें',
}

const ar: Messages = {
  ...en,
  settings: 'الإعدادات', general: 'عام', 'AI 계정': 'حسابات الذكاء الاصطناعي', 스킬: 'المهارات',
  '데이터 및 기억': 'البيانات والذاكرة', '앱 정보': 'حول التطبيق', 돌아가기: 'رجوع', '설정 항목': 'أقسام الإعدادات',
  '내 기기의 개인 공간': 'مساحتك الخاصة على هذا الجهاز', 화면: 'المظهر', 테마: 'السمة',
  'Non의 화면 스타일을 선택하세요.': 'اختر مظهر Non.', '시스템 설정 사용': 'استخدام إعداد النظام', 라이트: 'فاتح', 다크: 'داكن', 시스템: 'النظام',
  '테마 미리보기': 'معاينة السمة', 언어: 'اللغة', '앱에서 사용할 언어를 선택하세요.': 'اختر لغة التطبيق.', 레이아웃: 'التخطيط',
  사이드바: 'الشريط الجانبي', '폴더와 노트 탐색을 표시합니다.': 'إظهار التنقل بين المجلدات والملاحظات.', 'AI 패널': 'لوحة الذكاء الاصطناعي',
  '문서 옆에서 대화를 이어갑니다.': 'تابع المحادثة بجانب المستند.', 연결: 'الاتصالات', 연결됨: 'متصل', '연결되지 않음': 'غير متصل',
  '다시 연결': 'إعادة الاتصال', '연결 해제': 'قطع الاتصال', 취소: 'إلغاء', 확인: 'تأكيد', 관리: 'إدارة', 문서: 'المستندات', 기억: 'الذاكرة',
  복구: 'استعادة', '영구 삭제': 'حذف نهائي', 앱: 'التطبيق', 버전: 'الإصدار', 삭제: 'حذف',
  '문서 찾기': 'البحث عن مستندات', '새 노트': 'ملاحظة جديدة', '새 캔버스': 'لوحة جديدة', '새 전사': 'تفريغ جديد', '최근 항목': 'الأخيرة', 파일: 'الملفات',
  '폴더를 여는 중입니다.': 'جارٍ فتح المجلد…', '새 JSON 노트': 'ملاحظة JSON جديدة', '새 Markdown': 'Markdown جديد', 'PDF 가져오기': 'استيراد PDF', '오디오 전사': 'تفريغ الصوت',
  설정: 'الإعدادات', 캔버스: 'لوحة', 폴더: 'مجلد', 열기: 'فتح', '이름 바꾸기': 'إعادة تسمية', 보관: 'أرشفة', '새 대화': 'محادثة جديدة', '대화 기록': 'سجل المحادثات',
  '저장된 대화가 없습니다.': 'لا توجد محادثات محفوظة.', '대화 불러오는 중': 'جارٍ تحميل المحادثة…', '답변 작성 중': 'جارٍ كتابة الرد…', '생각하는 중': 'يفكر…',
  '질문하거나, 생각을 적어 보세요…': 'اطرح سؤالًا أو اكتب فكرة…', '먼저 폴더를 추가해 주세요': 'أضف مجلدًا أولًا', '이미지 첨부': 'إرفاق صورة',
  '현재 문서 첨부': 'إرفاق المستند الحالي', 'AI 모델': 'نموذج الذكاء الاصطناعي', '모델 선택': 'اختر نموذجًا', 'AI 계정 연결': 'ربط حساب ذكاء اصطناعي',
  '메시지 보내기': 'إرسال الرسالة', '응답 중지': 'إيقاف الرد', '새 전사 세션': 'جلسة تفريغ جديدة', '오디오 입력과 언어를 선택하세요.': 'اختر مصدر الصوت واللغة.',
  입력: 'الإدخال', '실시간 마이크': 'ميكروفون مباشر', '오디오 파일': 'ملف صوتي', '음성 언어': 'لغة الكلام', '실시간 전사 시작': 'بدء التفريغ المباشر', '파일 선택': 'اختيار ملف',
  한국어: 'الكورية', '이전 페이지': 'الصفحة السابقة', '다음 페이지': 'الصفحة التالية', 축소: 'تصغير', 확대: 'تكبير', 'PDF 읽는 중': 'جارٍ تحميل PDF…',
  '검색 중…': 'جارٍ البحث…', '검색 결과가 없습니다.': 'لا توجد نتائج.', '기억 검색': 'بحث في الذاكرة', '기억 추가': 'إضافة ذاكرة', '저장 범위': 'نطاق التخزين', 저장: 'حفظ', 휴지통: 'سلة المهملات',
  '문서 검색': 'بحث في المستندات', '검색 결과': 'نتائج البحث', 이동: 'نقل', 닫기: 'إغلاق', '문서 연결': 'روابط المستند', 백링크: 'الروابط الخلفية', '나가는 링크': 'الروابط الصادرة',
  '배경 변경': 'تغيير الغلاف', '배경 추가': 'إضافة غلاف', '문서 배경': 'غلاف المستند', '배경 제거': 'إزالة الغلاف', '노트 제목': 'عنوان الملاحظة', '제목 없음': 'بلا عنوان',
  '블록 명령': 'أوامر الكتل', '일치하는 블록이 없습니다.': 'لا توجد كتل مطابقة.', '복사본 저장': 'حفظ نسخة', '전사 중': 'جارٍ التفريغ', '준비 중': 'جارٍ التحضير',
  '마무리 중': 'جارٍ الإنهاء', '녹음 중': 'جارٍ التسجيل', '전사 탭 열기': 'فتح تبويب التفريغ', '전사 중지': 'إيقاف التفريغ',
}

const dictionaries: Record<AppLanguage, Messages> = { ko: {}, en, 'zh-CN': zhCN, es, hi, ar }

export function detectAppLanguage(
  languages: readonly string[] | undefined =
    typeof navigator === 'undefined' ? [] : navigator.languages,
): AppLanguage {
  for (const value of languages ?? []) {
    const language = value.toLowerCase()
    if (language.startsWith('ko')) return 'ko'
    if (language.startsWith('zh')) return 'zh-CN'
    if (language.startsWith('es')) return 'es'
    if (language.startsWith('hi')) return 'hi'
    if (language.startsWith('ar')) return 'ar'
    if (language.startsWith('en')) return 'en'
  }
  return 'en'
}

export function translate(language: AppLanguage, key: string, variables?: Variables) {
  let value = dictionaries[language][key] ?? key
  if (variables) {
    for (const [name, replacement] of Object.entries(variables)) {
      value = value.replaceAll(`{${name}}`, String(replacement))
    }
  }
  return value
}

type I18nValue = {
  language: AppLanguage
  t: (key: string, variables?: Variables) => string
  locale: string
}

const I18nContext = createContext<I18nValue>({ language: 'ko', t: (key) => key, locale: 'ko-KR' })

const locales: Record<AppLanguage, string> = { ko: 'ko-KR', en: 'en-US', 'zh-CN': 'zh-CN', es: 'es-ES', hi: 'hi-IN', ar: 'ar-SA' }

export function I18nProvider({ language, children }: { language: AppLanguage; children: ReactNode }) {
  const value = useMemo<I18nValue>(() => ({
    language,
    locale: locales[language],
    t: (key, variables) => translate(language, key, variables),
  }), [language])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  return useContext(I18nContext)
}
