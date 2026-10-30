package com.f106.DIO.push.service;

import java.util.*;

/** Non-secret deployment declarations. Deployment metadata is not proof of key material. */
public final class PushKeyDeployment {
    private PushKeyDeployment() {}
    public record Instance(String id, String environment, String appId, String active, Map<String,String> versions) {
        public Instance {
            check(id); check(environment); check(appId); check(active);
            versions=Map.copyOf(versions);
            if(versions.isEmpty() || !versions.containsKey(active)) throw new IllegalArgumentException("Invalid deployment declaration");
            versions.forEach((key,version)->{check(key);check(version);});
        }
    }
    private static void check(String value) {
        if(value==null || !value.matches("[A-Za-z0-9_.-]{1,160}")) throw new IllegalArgumentException("Invalid deployment declaration");
    }
    public static Map<String,String> parseVersions(String input) {
        var versions=new TreeMap<String,String>();
        if(input==null || input.isBlank()) throw new IllegalArgumentException("Missing secret versions");
        for(String entry:input.split(";",-1)) {
            String[] pair=entry.split("=",-1);
            if(pair.length!=2) throw new IllegalArgumentException("Invalid secret versions");
            check(pair[0]);check(pair[1]);
            if(versions.putIfAbsent(pair[0],pair[1])!=null) throw new IllegalArgumentException("Duplicate key ID");
        }
        return Map.copyOf(versions);
    }
    public static Instance snapshot(String id, String environment, String appId, String active, Set<String> loadedIds, String declaredVersions) {
        Map<String,String> versions=parseVersions(declaredVersions);
        if(!versions.keySet().equals(loadedIds)) throw new IllegalArgumentException("Loaded keys and declared versions differ");
        return new Instance(id,environment,appId,active,versions);
    }
    /** Inventory must come from the deployment platform, including all running and draining replicas. */
    public static boolean agrees(Set<String> expected, String environment, String appId, String active, Set<String> requiredKeys, Collection<Instance> instances) {
        if(expected.isEmpty() || requiredKeys.isEmpty() || instances.size()!=expected.size()) return false;
        Set<String> seen=new HashSet<>();Map<String,String> baseline=null;
        for(Instance instance:instances) {
            if(!seen.add(instance.id()) || !expected.contains(instance.id()) || !environment.equals(instance.environment()) || !appId.equals(instance.appId()) || !active.equals(instance.active()) || !instance.versions().keySet().containsAll(requiredKeys)) return false;
            if(baseline==null) baseline=instance.versions();
            else if(!baseline.equals(instance.versions())) return false;
        }
        return seen.equals(expected);
    }
}
