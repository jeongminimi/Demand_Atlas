# 데이터 파이프라인

원천 3.07GB에서 최종 31KB까지, 단계별로 무엇을 버리고 무엇을 남겼는지의 기록입니다.
중간 산출물 중 큰 파일(`fact_artist_country_daily.csv` 73MB, `kpop.db` 126MB,
gzip 청크 628MB)은 저장소에 넣지 않았습니다. 아래 절차로 재현할 수 있습니다.

## 0. 원천

[Kaggle · gonzalopezgil/spotify-charts-daily-updated](https://www.kaggle.com/datasets/gonzalopezgil/spotify-charts-daily-updated) (CC BY-SA 4.0, 매일 갱신)

| 파일 | 크기 | 행 | 주요 컬럼 |
|---|---|---|---|
| `charts_artists_daily.csv` | 3.07 GB | 25,148,197 | date, country, rank, uri, artist_name, peak_rank, previous_rank, days_on_chart, consecutive_days, entry_status, peak_date, entry_rank, entry_date |
| `charts_albums_weekly.csv` | 648 MB | — | 위 + **label**, artist_uris, release_date |

기간 2021-10-21 ~ 2026-11-05, 71개국 (+ `global` 집계 행, 분석에서 제외).

## 1. 소속사 라벨로 코호트 추출

일별 차트에는 소속사 정보가 없고, **주간 앨범 차트에만 `label` 컬럼이 있습니다.**
여기서 K-pop 소속사 라벨을 매칭해 아티스트를 뽑습니다.
→ `data/labels_core.txt`, `data/labels_expanded.txt`

처음에는 줄 전체에 `grep -i -F`를 걸었다가, 스페인어 `-ador`로 끝나는 단어가
`ADOR` 라벨에 매칭돼 중남미 레이블 96건이 딸려 들어왔습니다.
**CSV를 파싱해 `label` 컬럼만 비교하도록** 고쳐서 184 → 88팀.

## 2. 코호트 보정 (93 → 107팀)

라벨 매칭만으로는 **앨범이 매칭 라벨로 차트에 오른 적 있는 아티스트**만 잡힙니다.
TOMORROW X TOGETHER(59개국 차트인)와 TWICE(57개국)가 통째로 빠졌습니다.

| 단계 | 팀 수 | 방법 |
|---|---|---|
| 라벨 매칭 | 93 | `data/kpop_artists.csv` |
| 수동 추가 | +4 | `data/whitelist_manual_add.csv` (TXT, TWICE, ILLIT, PLAVE) |
| 라벨 확장 | +13 | `data/labels_expanded.txt` (ZEROBASEONE, IU, CHUNG HA, WOODZ 등) |
| 비한국 제외 | −3 | FUNKY MONKEY BABYS·SILENT SIREN(DREAMUSIC), PREP(Bright Antenna) |
| **최종** | **107** | `data/cohort_uris.txt` |

여전히 못 잡는 팀: KATSEYE, TWS, KISS OF LIFE, QWER, izna, MEOVV, Hearts2Hearts,
ALLDAY PROJECT. **앨범이 매칭 라벨로 차트에 오른 기록이 없어 구조적으로 도달 불가**입니다.
이 때문에 전세계 시계열은 하향 편향됩니다 (README의 한계 항목 참고).

## 3. 3GB 파일 쪼개기

전체 스캔이 180초 I/O 타임아웃에 걸립니다 (처리량 4–18 MB/s로 변동).
`dd`로 바이트 레인지를 잘라 4등분한 뒤 각각 gzip:

```bash
for i in 0 1 2 3; do
  dd if=charts_artists_daily.csv bs=1M skip=$((i*790)) count=790 2>/dev/null \
    | gzip -1 > gz/p$i.gz &
done; wait
```

청크가 정확히 맞물리므로 **이어 붙이면 원본과 바이트 단위로 동일**합니다.
검증: `zcat gz/p*.gz | wc -l` → 25,148,198 (헤더 포함).
3.07GB → 628MB, 전체 스캔 2분 30초 → 38초.

## 4. 팩트 테이블

코호트 URI로 필터링해 필요한 컬럼만 남깁니다.

```bash
zcat gz/p*.gz | grep -F -f data/cohort_uris.txt > fact_artist_country_daily.csv
```

25,148,197행 → **614,789행** (73MB).

> 초기에 93팀 URI만 쓴 탓에 수동 추가 4팀의 행이 누락돼 565,824행이 나왔습니다.
> 보정 후 614,789행.

## 5. SQLite 적재

```sql
CREATE INDEX ix_uri_date     ON fact(uri, date);
CREATE INDEX ix_uri_country  ON fact(uri, country);
CREATE INDEX ix_country_date ON fact(country, date);
```

126MB. 아티스트별 조회 **2.58s → 0.26s**.

> parquet을 먼저 시도했으나 pyarrow·fastparquet·duckdb·polars가 모두 설치 불가
> (패키지 프록시 403)인 환경이라 SQLite로 대체했습니다.

## 6. 침투율 집계 → `data/tool_data.json`

컴백 윈도우(`peak_date − 7` ~ `peak_date + 53`, 60일) 안에서
`체류일 비중 × 순위 가중 × 최근성 가중`을 계산합니다.

대상은 **전 기간 최고 순위 15위 이내**인 24팀.

> 처음에는 더 높은 기준선을 썼는데, Jin(peak 45, 북미 1행)·i-dle(22, 1행)은 들어가고
> SEVENTEEN(19, 44행)은 빠지는 모순이 생겨 peak≥15로 통일했습니다.
> BIGHIT MUSIC 협업 크레딧으로 딸려 들어온 GloRilla는 제외했습니다.

> 표본 가드 버그: 초기에는 **전 기간** 행 수로 판단해, 윈도우 안에 근거가 전혀 없는
> SEVENTEEN의 북미에 5,170개가 배정됐습니다. **윈도우 안의 차트 체류일**로 판단하도록
> 고쳐서 지금은 수동으로 넘어갑니다.

## 7. 국가×월 점유율 → `data/kpop_share.csv`

각국 Top 200에서 코호트가 차지한 행 수를, 그 달의 전체 행 수로 나눕니다.
분모는 모든 국가가 하루 200칸으로 동일하므로 국가 간 비교가 성립합니다.

```bash
zcat gz/p*.gz | LC_ALL=C gawk -F',' '
NR==FNR { K[$1]=1; next }
FNR==1 && $1=="date" { next }
{ u=$4; gsub(/"/,"",u); c=$2; if(c=="global") next;
  key=c "|" substr($1,1,7); tot[key]++; if(u in K) kp[key]++ }
END{ print "country,month,kpop_rows,total_rows,share_pct";
  for(k in tot){ split(k,p,"|");
    printf "%s,%s,%d,%d,%.3f\n", p[1], p[2], (k in kp?kp[k]:0), tot[k],
           (k in kp?kp[k]:0)/tot[k]*100 } }
' data/cohort_uris.txt - > data/kpop_share.csv
```

4,324행 (국가 × 월). 전체 스캔 2분 4초.

## 8. 페이지 페이로드

```
data/kpop_share.csv  ──> data/share_data.json       (70개국 × 60개월 시계열)
                     ──> data/share_page_data.json  (src/mkshare.py: 권역 집계 + 한글 국가명)
```

권역은 이 프로젝트에서 직접 정의했습니다 (`src/mkshare.py`의 `REG`).
권역 값은 소속 국가의 **단순 평균**입니다 — 모든 국가의 분모가 하루 200칸으로
같으므로 가중이 필요 없습니다.

마지막으로 `src/build.py`가 템플릿에 JSON을 인라인해 단일 HTML 두 개를 만듭니다.
