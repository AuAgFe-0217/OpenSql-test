# Git 연동 및 자동 배포

이 앱은 정적 파일로 구성되어 GitHub Pages 또는 Cloudflare Pages에 배포할 수 있습니다. GitHub Pages용 자동 배포 Workflow는 `.github/workflows/pages.yml`에 준비되어 있습니다.

## GitHub Pages 방식

1. GitHub에서 새 저장소를 만듭니다. Pages 사이트는 공개 웹사이트입니다. GitHub Free에서 Pages를 사용하려면 공개 저장소가 필요할 수 있으므로, 실제 배포 전에 계정 요금제와 저장소 공개 범위를 확인하세요.
2. 이 폴더에서 `git init -b main`으로 저장소를 초기화하고, `git add .`, `git commit -m "Initial Open SQL Lab"`으로 앱 파일을 커밋합니다.
3. GitHub 저장소 주소를 원격으로 등록하고 `main`에 push합니다.
4. GitHub 저장소의 **Settings → Pages → Build and deployment → Source**에서 **GitHub Actions**를 선택합니다.
5. 이후 `main` 브랜치에 push할 때마다 Workflow가 앱 파일을 빌드 없이 묶어 GitHub Pages에 배포합니다. GitHub 웹에서 파일을 수정하고 commit해도 같은 배포가 실행됩니다.

`Open_SQL_프로젝트_학습노트.md`는 `.gitignore`에 포함해 소스 저장소에 실수로 올라가지 않도록 했습니다. Workflow는 배포할 때 앱에 필요한 HTML, CSS, JavaScript 파일만 게시합니다.

## 저장소를 비공개로 유지하려면

GitHub 비공개 저장소를 Cloudflare Pages에 연결하는 방식을 사용할 수 있습니다. Cloudflare Pages는 연결된 GitHub 저장소에 push가 생기면 자동 배포하고, 브랜치용 미리보기 배포도 제공합니다. 이 경우 Cloudflare 계정에서 GitHub 연결을 승인하고 Pages 프로젝트를 한 번 설정해야 합니다.

## 수정과 배포 흐름

로컬 편집기나 GitHub 웹에서 코드를 수정하고 commit/push하면 자동 배포가 시작됩니다. 코드 입력 즉시 운영 사이트에 반영되는 핫 리로드는 아니며, push 후 자동 빌드·배포가 끝나면 새 버전을 사용합니다.

이 앱의 프로젝트 코드와 학습 기록은 브라우저 Local Storage에 저장됩니다. 사용자가 서로의 프로젝트를 자동 공유하거나 계정 간 동기화하는 기능은 별도 백엔드가 필요합니다. 배포된 정적 앱 자체는 SAP에 연결하지 않습니다.
