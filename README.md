# 수학왕 추소이

중학교 1학년 학생이 수학 문제를 풀다 막힐 때 정답 대신 공식, 접근 방법, 숫자를 바꾼 유사 예시로 이해를 돕는 React/Vite 웹앱입니다.

## 로컬 실행

1. 프로젝트 폴더에서 의존성을 설치합니다.

```bash
npm install
```

2. `.env.example`을 복사해 `.env` 파일을 만들고 값을 입력합니다.

```env
VITE_GEMINI_API_KEY=Gemini API 키
VITE_GEMINI_MODEL=gemini-2.5-flash
TELEGRAM_BOT_TOKEN=텔레그램 봇 토큰
TELEGRAM_CHAT_ID=부모님 텔레그램 Chat ID
SUPABASE_URL=Supabase Project URL
SUPABASE_ANON_KEY=Supabase anon public key
```

3. 개발 서버를 실행합니다.

```bash
npm run dev
```

## Supabase 테이블 만들기

1. https://supabase.com 에 로그인합니다.
2. 프로젝트를 선택합니다.
3. 왼쪽 메뉴에서 `SQL Editor`를 클릭합니다.
4. `New query`를 클릭합니다.
5. 아래 SQL을 붙여넣고 `Run`을 누릅니다.

```sql
create table if not exists study_logs (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  problem_summary text not null,
  subject_tag text not null,
  understanding_status text not null,
  easier_count integer not null default 0,
  practice_problems_count integer not null default 0,
  practice_checked_count integer not null default 0,
  created_at timestamptz not null default now()
);
```

처음 테스트를 쉽게 하려면 `Table Editor`에서 `study_logs` 테이블의 RLS가 꺼져 있는지 확인하세요.

이미 예전 SQL로 테이블을 만들었다면 `SQL Editor`에서 아래 SQL을 한 번 더 실행해 새 컬럼을 추가하세요.

```sql
alter table study_logs
add column if not exists practice_problems_count integer not null default 0,
add column if not exists practice_checked_count integer not null default 0;
```

## Vercel 배포

1. GitHub에 새 저장소를 만듭니다.
2. 이 프로젝트를 GitHub 저장소에 push합니다.
3. https://vercel.com 에 로그인합니다.
4. `Add New...` 버튼을 누르고 `Project`를 선택합니다.
5. GitHub 저장소 목록에서 이 프로젝트를 선택하고 `Import`를 누릅니다.
6. Framework Preset이 `Vite`인지 확인합니다.
7. `Environment Variables` 영역에 `.env`와 같은 값을 하나씩 입력합니다.
8. `Deploy`를 누릅니다.

## Cron Job

`vercel.json`에 아래 설정이 들어 있습니다.

```json
{
  "crons": [{ "path": "/api/send-daily-report", "schedule": "0 0 * * *" }]
}
```

UTC 00:00에 실행되므로 한국 시간으로 매일 오전 9시에 전날 학습 기록을 텔레그램으로 보냅니다.

## 주요 파일

- `src/App.jsx`: 두 탭 화면, 문제 등록, 풀이 도움, 히스토리 UI
- `src/lib/gemini.js`: Gemini Flash 텍스트/이미지 연동
- `src/lib/storage.js`: localStorage 현재 문제/히스토리 관리
- `api/save-log.js`: Supabase 학습 기록 저장 API
- `api/send-daily-report.js`: 텔레그램 일일 리포트 API
- `vercel.json`: Vercel Cron 설정
