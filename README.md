# ACal — 동아리 공용 캘린더 웹앱

부원 약 200명이 링크로 보는 공개 조회 페이지(`index.html`)와, 캘린더 관리자 4명만 쓰는
관리자 페이지(`admin.html`)로 구성된 정적 웹앱. 서버/DB 없음, 전부 무료 서비스 조합
(GitHub Pages + Google Calendar + Google Apps Script + Google Sheet)으로 동작한다.

설계 배경과 의사결정 이유는 `CLAUDE.md`와 통신 규약은 `CONTRACT.md`를 참고.

## 1. 로컬에서 확인하기

`<script type="module">`은 `file://`로 열면 브라우저가 막으므로 반드시 정적 서버로 열어야 한다.

```
npx serve .
# 또는
python -m http.server
```

그 다음 `http://localhost:포트/index.html`, `http://localhost:포트/admin.html`로 접속.
`admin.html`은 아래 2~7단계를 먼저 마쳐야 로그인/쓰기가 동작한다.

## 2. 수동 설정 체크리스트 (최초 1회, 사람이 직접 하는 작업)

**반드시 동아리 공용 Google 계정(개인 계정 아님)으로 로그인한 상태에서 아래를 진행한다.**
개인 계정으로 만들면 그 사람이 졸업/탈퇴하는 순간 사이트 전체가 멈춘다.

1. **공용 Google 계정 생성** — 예: `동아리이름.official@gmail.com`.
2. **Google Calendar 생성** — Google Calendar 좌측 "다른 캘린더 만들기". 캘린더 설정 >
   "액세스 권한"에서 "공개 사용 설정" + "모든 일정 세부정보 보기"로 공유. 같은 설정 페이지
   "캘린더 통합" 절에서 **캘린더 ID**를 복사해 둔다 (`js/config.js`의 `CALENDAR_ID`,
   `apps-script/Code.gs`의 `CALENDAR_ID`에 붙여넣을 값).
3. **명단 스프레드시트 생성** — Google Sheets에서 새 스프레드시트, 아래 3개 탭을 만든다:

   ```
   탭 "밴드팀 목록"   | A: 팀ID(정수) | B: 팀 이름 | C: 활성(체크박스)
   탭 "파트 목록"     | A: 파트ID(정수) | B: 파트 이름 | C: 활성(체크박스)
   탭 "관리자 이메일" | A: 이메일 (헤더 없이 1행부터)
   ```

   - 밴드팀/파트 탭은 1행이 헤더, 데이터는 2행부터. C열은 삽입 > 체크박스로 만든다.
   - **ID는 처음 등록할 때 한 번만 정하고 이후 절대 바꾸지 않는다.** 새 팀/파트는 "현재
     마지막 ID + 1"을 쓴다. 팀/파트를 없앨 때는 행을 지우지 말고 C열 체크박스만 끈다
     (소프트 삭제) — 과거 이벤트와의 연결이 끊기지 않기 위함.
   - 초기 밴드팀/파트/관리자 이메일(최대 4명)을 입력해 둔다.
   - 주소창의 스프레드시트 ID(`https://docs.google.com/spreadsheets/d/<이 부분>/edit`)를
     복사해 둔다 (`Code.gs`의 `SPREADSHEET_ID`).

4. **Apps Script 프로젝트 생성**
   - [script.google.com](https://script.google.com) > 새 프로젝트.
   - 기본 `Code.gs` 내용을 지우고 이 저장소의 `apps-script/Code.gs` 전체를 붙여넣는다.
   - 왼쪽 사이드바 "서비스" 옆 **+** 클릭 > **Google Calendar API** 추가(식별자는 기본값
     `Calendar` 그대로). **이 단계를 빼먹으면 모든 쓰기 요청이 실패한다.**
   - 파일 상단의 상수를 채운다: `SPREADSHEET_ID`, `CALENDAR_ID`, `OAUTH_CLIENT_ID`(5번에서
     발급 후 다시 돌아와 채움), `WEEKLY_BAND_CAP`(합주 주당 최대 횟수, 기본 2).
   - **배포 > 새 배포** > 유형: 웹 앱 > 실행: **나** / 액세스 권한: **모든 사용자**.
   - 배포 완료 후 나오는 `.../exec` URL을 `js/config.js`의 `APPS_SCRIPT_URL`에 붙여넣는다.
   - **이후 코드를 고칠 때마다**: 배포 > 배포 관리 > 연필(수정) 아이콘 > 버전: **새 버전** >
     배포. **저장만 하고 이 단계를 안 하면 반영되지 않는다.** 이 방식은 URL이 그대로
     유지되므로 `config.js`를 다시 고칠 필요가 없다.

5. **OAuth 2.0 클라이언트 ID 발급** (Google Cloud Console — Apps Script가 자동 연결한
   프로젝트를 그대로 써도 됨)
   - API 및 서비스 > 사용자 인증 정보 > **사용자 인증 정보 만들기 > OAuth 클라이언트 ID** >
     애플리케이션 유형: **웹 애플리케이션**.
   - **승인된 자바스크립트 원본**에 배포될 GitHub Pages 주소(예:
     `https://<org>.github.io`)와 `http://localhost:포트`(로컬 테스트용)를 등록.
   - 발급된 클라이언트 ID를 `js/config.js`의 `GOOGLE_OAUTH_CLIENT_ID`와 `apps-script/Code.gs`의
     `OAUTH_CLIENT_ID` **양쪽에 정확히 동일하게** 넣는다. 하나라도 다르면 모든 관리자 요청이
     `INVALID_TOKEN`으로 거부된다.

6. **API 키 발급** (같은 Cloud 프로젝트)
   - 사용자 인증 정보 만들기 > **API 키**.
   - 키 제한 > **애플리케이션 제한사항: HTTP 리퍼러** — 배포될 GitHub Pages 주소(`https://<org>.github.io/*`)와
     `http://localhost:*/*` 등록.
   - **API 제한사항: 키 제한** — **Google Calendar API**만 선택.
   - 발급된 키를 `js/config.js`의 `API_KEY`에 붙여넣는다.
   - 이 단계까지는 결제(빌링) 계정 등록이 필요 없다 — 필요해지는 순간이 있다면 무언가
     잘못된 것이니 먼저 API 제한/쿼터를 점검한다.

7. **GitHub Organization + Pages**
   - 개인 계정이 아니라 **동아리 GitHub Organization**(무료)을 만들고 그 아래에 이 저장소를
     둔다.
   - 저장소 Settings > Pages > Source: `main` 브랜치 / 루트. 배포된 주소를 5·6단계의
     "승인된 원본"/"HTTP 리퍼러"에도 반영되어 있는지 다시 확인한다.

8. **권한 분산** — 캘린더 관리자 4명 중 2~3명을 아래 전부에 편집자로 추가한다(한 사람만
   접근 권한을 갖지 않도록):
   - Apps Script 프로젝트(편집기 우측 상단 "공유")
   - Google Cloud Console 프로젝트(IAM)
   - 명단 스프레드시트
   - Google Calendar(설정 > 특정 사용자와 공유)
   - GitHub organization/저장소

## 3. 운영 매뉴얼

- **팀/파트 추가**: 스프레드시트 해당 탭 맨 아래에 새 행 추가, ID는 "현재 마지막 ID + 1",
  활성 체크. 코드 수정이나 재배포 필요 없음 — 다음 관리자 페이지 새로고침부터 바로 보임.
- **팀/파트 이름 변경**: 이름 칸만 고치면 됨. ID가 그대로라 과거 일정 색상/주간 카운트는
  안 끊긴다.
- **팀/파트 삭제(소프트)**: 활성 체크박스만 끄기. 행 자체는 절대 지우지 않는다.
- **관리자 추가/제거**: "관리자 이메일" 탭에서 행 추가/삭제.
- **합주 주당 최대 횟수 변경**: `apps-script/Code.gs`의 `WEEKLY_BAND_CAP` 상수만 고치고
  "새 버전"으로 재배포. `js/config.js`는 안 건드려도 됨(그쪽 값은 표시용 폴백일 뿐).
- **Apps Script 코드 수정 후**: 반드시 배포 > 배포 관리 > 새 버전으로 재배포해야 반영된다.

## 4. 자주 생기는 문제

| 증상 | 원인 | 해결 |
|---|---|---|
| 공개 페이지에 일정이 하나도 안 뜸 | API 키 리퍼러 제한이 실제 배포 주소와 다름, 또는 캘린더 공유 설정이 비공개 | Cloud Console에서 키 제한 확인, 캘린더 공유 설정을 "공개 사용 설정"으로 확인 |
| 관리자 로그인 후 바로 "관리자 권한이 없습니다" | 로그인한 이메일이 "관리자 이메일" 탭에 없음 | 시트에 이메일 추가(소문자 여부는 서버가 알아서 처리하지만 오탈자 확인) |
| 관리자 요청이 전부 INVALID_TOKEN | `config.js`와 `Code.gs`의 OAuth 클라이언트 ID가 다름 | 두 값을 다시 대조 |
| 일정 등록 시 CALENDAR_ERROR | Apps Script에 Google Calendar API(고급 서비스)를 안 붙임 | 서비스 목록에 Calendar API 추가 |
| 코드를 고쳤는데 동작이 그대로 | "새 버전"으로 재배포하지 않고 저장만 함 | 배포 관리에서 새 버전으로 재배포 |

## 5. 인계 시나리오 확인

새 관리자가 원래 개발자 없이도 다음이 되는지 확인한다: 자신의 계정으로 Apps Script
프로젝트를 열어 코드 수정 후 재배포, Cloud Console에서 API 키/OAuth 클라이언트 ID 확인,
스프레드시트에서 관리자/팀/파트 추가·제거, GitHub 저장소에 접근해 정적 파일 수정 후 푸시.
