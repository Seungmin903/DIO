import os

# 테스트에서는 SAM 2 모델을 올리지 않는다. 가짜 segmenter 를 끼워 넣는다.
os.environ["SAM2_PRELOAD"] = "0"
