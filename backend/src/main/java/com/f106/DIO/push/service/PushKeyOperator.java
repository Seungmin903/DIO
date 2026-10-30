package com.f106.DIO.push.service;

import java.io.PrintStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;

/** Offline operator entry point: no HTTP listener, application context, scheduler or sender. */
public final class PushKeyOperator {
    private PushKeyOperator() {}
    private static String required(Map<String,String> env,String name) {
        String value=env.get(name);
        if(value==null || value.isBlank()) throw new IllegalArgumentException("Missing required configuration: "+name);
        return value;
    }
    private static Set<String> csv(String value) {
        if(value==null || value.isBlank()) throw new IllegalArgumentException("Empty inventory");
        var result=new HashSet<String>();
        for(String item:value.split(",",-1)) if(!item.matches("[A-Za-z0-9_.-]{1,160}") || !result.add(item)) throw new IllegalArgumentException("Invalid inventory");
        return result;
    }
    private static String versions(Map<String,String> values) {
        return new TreeMap<>(values).entrySet().stream().map(e->e.getKey()+"="+e.getValue()).collect(java.util.stream.Collectors.joining(";"));
    }
    public static int run(String[] args,Map<String,String> env,PrintStream out) throws Exception {
        if(args.length==0) throw new IllegalArgumentException("Missing command");
        if("verify".equals(args[0])) {
            if(args.length<6) throw new IllegalArgumentException("verify ENV APP ACTIVE REQUIRED_KEYS INSTANCE_IDS FILE...");
            var instances=new ArrayList<PushKeyDeployment.Instance>();
            for(int i=6;i<args.length;i++) {
                var p=new Properties();try(var reader=Files.newBufferedReader(Path.of(args[i]))) {p.load(reader);}
                instances.add(new PushKeyDeployment.Instance(p.getProperty("instance"),p.getProperty("environment"),p.getProperty("app"),p.getProperty("active"),PushKeyDeployment.parseVersions(p.getProperty("versions"))));
            }
            boolean ok=PushKeyDeployment.agrees(csv(args[5]),args[1],args[2],args[3],csv(args[4]),instances);
            out.println("declarations_match="+ok);
            out.println("attestation=declarations_only_verify_inventory_and_secret_manager");
            return ok?0:2;
        }
        String environment=required(env,"PUSH_ENVIRONMENT"),appId=required(env,"PUSH_APP_ID");
        var installation=new PushInstallationService(null,null,env.getOrDefault("PUSH_ENCRYPTION_KEY",""),environment,appId);
        installation.setActiveKeyId(required(env,"PUSH_ACTIVE_KEY_ID"));
        installation.setConfiguredKeys(env.getOrDefault("PUSH_ENCRYPTION_KEYS",""));
        var keys=installation.secrets();
        if("status".equals(args[0])) {
            if(args.length!=1) throw new IllegalArgumentException("status takes no arguments");
            var snapshot=PushKeyDeployment.snapshot(required(env,"PUSH_INSTANCE_ID"),environment,appId,keys.activeId(),keys.keyIds(),required(env,"PUSH_KEY_SECRET_VERSIONS"));
            out.println("instance="+snapshot.id());out.println("environment="+snapshot.environment());out.println("app="+snapshot.appId());
            out.println("active="+snapshot.active());out.println("versions="+versions(snapshot.versions()));
            return 0;
        }
        String url=required(env,"DB_URL");
        if(!url.startsWith("jdbc:postgresql://")) throw new IllegalArgumentException("PostgreSQL URL required");
        var source=new DriverManagerDataSource(url,required(env,"POSTGRES_USER"),required(env,"POSTGRES_PASSWORD"));
        var jdbc=new JdbcTemplate(source);var tx=new TransactionTemplate(new DataSourceTransactionManager(source));
        installation=new PushInstallationService(jdbc,null,env.getOrDefault("PUSH_ENCRYPTION_KEY",""),environment,appId);
        installation.setActiveKeyId(required(env,"PUSH_ACTIVE_KEY_ID"));installation.setConfiguredKeys(env.getOrDefault("PUSH_ENCRYPTION_KEYS",""));
        var rotation=new PushKeyRotation(jdbc,installation);
        if("remaining".equals(args[0]) && args.length==1) {
            long remaining=rotation.remaining(environment,appId),orphans=rotation.orphanCiphertexts();
            out.println("remaining_installations="+remaining);out.println("orphan_ciphertexts_global="+orphans);
            return remaining==0 && orphans==0?0:2;
        }
        if("clear-expired".equals(args[0]) && args.length==1) {
            int cleared=tx.execute(status->new PushRegistrationCleanup(jdbc).clearExpired(Instant.now()));
            out.println("cleared="+cleared);out.println("orphan_ciphertexts_global="+rotation.orphanCiphertexts());
            return 0;
        }
        if("batch".equals(args[0]) && args.length==3) {
            int size=Integer.parseInt(args[1]);UUID cursor="-".equals(args[2])?null:UUID.fromString(args[2]);
            var result=tx.execute(status->rotation.rotateBatchReport(environment,appId,size,cursor));
            out.println("processed="+result.processed());out.println("failed="+result.failed().size());
            for(UUID id:result.failed()) out.println("failed_installation="+id);
            out.println("next_cursor="+(result.nextCursor()==null?"-":result.nextCursor()));
            out.println("remaining_installations="+rotation.remaining(environment,appId));out.println("orphan_ciphertexts_global="+rotation.orphanCiphertexts());
            return result.failed().isEmpty()?0:2;
        }
        throw new IllegalArgumentException("Unknown command or invalid arguments");
    }
    public static void main(String[] args) {
        int code;
        try {code=run(args,System.getenv(),System.out);}
        catch(Exception e) {System.err.println("Push operator failed; check configuration and database access.");code=1;}
        if(code!=0) System.exit(code);
    }
}
