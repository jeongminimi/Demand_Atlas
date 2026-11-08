# data/

이 디렉터리의 파일은 [Spotify Charts (Kaggle)](https://www.kaggle.com/datasets/gonzalopezgil/spotify-charts-daily-updated)
(CC BY-SA 4.0)를 가공한 **파생물**이므로 동일하게 **CC BY-SA 4.0**을 따릅니다.

| 파일 | 내용 |
|---|---|
| `cohort_uris.txt` | 분석 대상 K-pop 107팀의 Spotify URI |
| `kpop_artists.csv` | 소속사 라벨 매칭으로 추출한 93팀 |
| `whitelist_manual_add.csv` | 라벨 매칭으로 못 잡아 수동 추가한 4팀 |
| `labels_core.txt` / `labels_expanded.txt` | 매칭에 쓴 소속사 라벨 목록 |
| `kpop_releases.csv` | 코호트의 앨범 릴리스 227건 |
| `agg_summary.csv` | 아티스트별 차트 커버리지 요약 |
| `kpop_share.csv` | 국가 × 월 점유율 원자료 4,324행 |
| `share_data.json` | 70개국 60개월 시계열 |
| `share_page_data.json` | 위를 권역 집계·한글화한 페이지 페이로드 (`src/mkshare.py` 생성) |
| `tool_data.json` | 도구용 침투율 집계 (24팀) |

원천 CSV와 중간 산출물(팩트 테이블 73MB, SQLite 126MB, gzip 청크 628MB)은
크기 때문에 제외했습니다. 재현 절차는 [`../docs/PIPELINE.md`](../docs/PIPELINE.md).
