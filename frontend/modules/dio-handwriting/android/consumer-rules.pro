# ONNX Runtime의 JNI 코드(libonnxruntime4j_jni.so)는 ai/onnxruntime/OnnxTensor,
# TensorInfo, OrtException 같은 Java 클래스와 생성자를 이름으로 찾는다.
# onnxruntime-android AAR에는 keep 규칙이 없어서, 운영(release) 빌드에서 R8이
# 이 클래스들을 지우거나 이름을 바꾸면 폰트 생성 중 JNI가 실패해 앱이 종료된다.
-keep class ai.onnxruntime.** { *; }
-keepclassmembers class ai.onnxruntime.** { *; }
