# 배경 그림 원본

Stitch로 만든 원본(1376×768 JPEG, 캐릭터 그림과 같은 화풍)입니다. 게임은 가공한 `src/assets/backgrounds/`를 씁니다.
가공은 ImageMagick 7(`magick`)으로 하고, 품질 88로 다시 압축합니다(한 장 400KB 이하 목표, 실제 52~140KB).
y 측정값은 가운데 세로 띠에서 색이 바뀌는 행입니다.

| 원본 | 용도 | 가공 | 측정값(원본 px) |
|---|---|---|---|
| `feed-stage.jpg` | 와이드·클로즈업 카메라 화면 | 자르지 않음 | 뒷벽과 바닥이 만나는 선 y 472(470은 벽색, 475는 바닥색) |
| `feed-audience.jpg` | 관객석 카메라 화면 | 자르지 않음 | 좌석 영역 y 300~576 |
| `wall-back.jpg` | 스튜디오 뒷벽(z=0 면, 16m × 2.5m) | 벽 비율 6.4에 맞춘 가로 전체 띠 y 255~470(아래끝 = 벽 밑선) | 벽 밑선 y 470, 그 아래는 바닥 |
| `wall-side.jpg` | 스튜디오 왼쪽 벽(x=0 면, 10m × 2.5m) | 벽 비율 4에 맞춘 가운데 띠 y 212~556 | 전체가 벽 |
| `floor.jpg` | 스튜디오 바닥(x 0~16, z 0~10) | 카펫과 경계선(x 0~358)을 230px로 좁히고 나무 바닥 x 372~1370(998px)을 붙여 1228×768(16:10)로 만듦. 카펫이 x 0~3, 원형 러그는 찌그러지지 않음 | 카펫 x 0~338, 검은 경계선 338~358, 나무 358부터 |

```sh
cd art-source/backgrounds
OUT=../../src/assets/backgrounds
magick feed-stage.jpg -strip -quality 88 $OUT/feed-stage.jpg
magick feed-audience.jpg -strip -quality 88 $OUT/feed-audience.jpg
magick wall-back.jpg -crop 1376x215+0+255 +repage -strip -quality 88 $OUT/wall-back.jpg
magick wall-side.jpg -crop 1376x344+0+212 +repage -strip -quality 88 $OUT/wall-side.jpg
magick \( floor.jpg -crop 358x768+0+0 +repage -resize 230x768\! \) \
  \( floor.jpg -crop 998x768+372+0 +repage \) +append -strip -quality 88 $OUT/floor.jpg
```

카메라 화면의 가로선 값(수평선, 발 기준선, 관객 영역)은 `src/render/backdrop.ts`의 `FEED_BACKDROP_PIXELS`에 원본 px로 있습니다.
