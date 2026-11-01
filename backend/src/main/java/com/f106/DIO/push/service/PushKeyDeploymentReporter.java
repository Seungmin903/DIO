package com.f106.DIO.push.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/** Optional non-secret startup declaration from the running instance; logs need restricted access. */
@Component
@ConditionalOnProperty(name="dio.push.deployment-report.enabled",havingValue="true")
public class PushKeyDeploymentReporter {
    private static final Logger log=LoggerFactory.getLogger(PushKeyDeploymentReporter.class);
    private final PushInstallationService installations;
    private final String instance,environment,app,versions;
    public PushKeyDeploymentReporter(PushInstallationService installations,
            @Value("${PUSH_INSTANCE_ID:}") String instance,
            @Value("${dio.push.environment:}") String environment,
            @Value("${dio.push.app-id:dio}") String app,
            @Value("${PUSH_KEY_SECRET_VERSIONS:}") String versions) {
        this.installations=installations;this.instance=instance;this.environment=environment;this.app=app;this.versions=versions;
    }
    @EventListener(ApplicationReadyEvent.class)
    public void report() {
        try {
            var keys=installations.secrets();
            var status=PushKeyDeployment.snapshot(instance,environment,app,keys.activeId(),keys.keyIds(),versions);
            log.info("push_key_deployment instance={} environment={} app={} active={} versions={}",status.id(),status.environment(),status.appId(),status.active(),new java.util.TreeMap<>(status.versions()));
        } catch(RuntimeException e) {
            log.error("push_key_deployment invalid; deployment verification must fail");
        }
    }
}
