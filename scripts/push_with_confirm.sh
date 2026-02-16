#!/usr/bin/env bash
set -euo pipefail

branch="${1:-$(git branch --show-current)}"

if [[ -z "${branch}" ]]; then
  echo "현재 브랜치를 찾을 수 없습니다."
  exit 1
fi

echo "원격 저장소: $(git remote get-url origin)"
echo "브랜치: ${branch}"
echo
git status --short
echo

read -r -p "지금 이 변경사항을 업로드(push)할까요? [y/N] " answer
if [[ ! "${answer}" =~ ^[Yy]$ ]]; then
  echo "업로드를 취소했습니다."
  exit 0
fi

git push -u origin "${branch}"
echo "업로드 완료: origin/${branch}"
