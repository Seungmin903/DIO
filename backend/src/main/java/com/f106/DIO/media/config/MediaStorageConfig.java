package com.f106.DIO.media.config;

import java.time.Duration;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import com.f106.DIO.media.storage.S3MediaStorage;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;

@Configuration(proxyBeanMethods = false)
public class MediaStorageConfig {
	@Bean(name = "mediaS3Client", destroyMethod = "close")
	@ConditionalOnProperty(name = "dio.media.storage", havingValue = "s3")
	S3Client mediaS3Client(@Value("${dio.media.s3-bucket:}") String bucket,
			@Value("${dio.media.s3-region:ap-northeast-2}") String region) {
		if (bucket.isBlank() || region.isBlank()) throw new IllegalStateException("S3 media bucket and region are required");
		return S3Client.builder().region(Region.of(region))
			.httpClientBuilder(UrlConnectionHttpClient.builder().connectionTimeout(Duration.ofSeconds(5)).socketTimeout(Duration.ofSeconds(5)))
			.overrideConfiguration(config -> config.apiCallTimeout(Duration.ofSeconds(20)).apiCallAttemptTimeout(Duration.ofSeconds(5))).build();
	}
	@Bean
	@ConditionalOnProperty(name = "dio.media.storage", havingValue = "s3")
	S3MediaStorage s3MediaStorage(@Qualifier("mediaS3Client") S3Client client,
			@Value("${dio.media.s3-bucket:}") String bucket) {
		return new S3MediaStorage(client, bucket);
	}
}
