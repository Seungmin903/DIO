# 1단계: Java와 Gradle로 Spring Boot JAR 생성
FROM eclipse-temurin:17-jdk-jammy AS builder

WORKDIR /workspace

COPY gradlew ./
COPY gradle ./gradle
COPY build.gradle settings.gradle ./

RUN chmod +x gradlew
RUN ./gradlew dependencies --no-daemon

COPY src ./src

RUN ./gradlew bootJar --no-daemon


# 2단계: 만들어진 JAR만 실행
FROM eclipse-temurin:17-jre-jammy

WORKDIR /app

COPY --from=builder /workspace/build/libs/*.jar app.jar

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]
