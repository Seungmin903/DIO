package com.f106.DIO.push;

import com.f106.DIO.push.service.PushKeyDeployment;
import com.f106.DIO.push.service.PushKeyOperator;
import java.io.*;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.assertj.core.api.Assertions.*;

class PushKeyDeploymentTests {
    @TempDir Path dir;
    @Test void verifiesEveryReplicaAndRejectsMixedVersionsAndMissingInventory() throws Exception {
        var a=PushKeyDeployment.snapshot("a","development","dio","new",Set.of("legacy","new"),"legacy=v1;new=v2");
        var b=PushKeyDeployment.snapshot("b","development","dio","new",Set.of("legacy","new"),"legacy=v1;new=v2");
        assertThat(PushKeyDeployment.agrees(Set.of("a","b"),"development","dio","new",Set.of("legacy","new"),List.of(a,b))).isTrue();
        assertThat(PushKeyDeployment.agrees(Set.of("a","b"),"development","dio","new",Set.of("legacy","new"),List.of(a))).isFalse();
        var mismatched=PushKeyDeployment.snapshot("b","development","dio","new",Set.of("legacy","new"),"legacy=v1;new=v3");
        assertThat(PushKeyDeployment.agrees(Set.of("a","b"),"development","dio","new",Set.of("legacy","new"),List.of(a,mismatched))).isFalse();
        assertThatThrownBy(()->PushKeyDeployment.snapshot("a","development","dio","new",Set.of("new"),"legacy=v1;new=v2")).isInstanceOf(IllegalArgumentException.class);
        Path one=dir.resolve("a.properties"),two=dir.resolve("b.properties");
        Files.writeString(one,"instance=a\nenvironment=development\napp=dio\nactive=new\nversions=legacy=v1;new=v2\n");
        Files.writeString(two,"instance=b\nenvironment=development\napp=dio\nactive=new\nversions=legacy=v1;new=v2\n");
        var out=new ByteArrayOutputStream();
        assertThat(PushKeyOperator.run(new String[]{"verify","development","dio","new","legacy,new","a,b",one.toString(),two.toString()},Map.of(),new PrintStream(out))).isZero();
        assertThat(out.toString()).contains("declarations_match=true","declarations_only");
    }
    @Test void snapshotDoesNotPrintKeyMaterial() throws Exception {
        String key=Base64.getEncoder().encodeToString(new byte[32]);
        var env=Map.of("PUSH_ENVIRONMENT","development","PUSH_APP_ID","dio","PUSH_ACTIVE_KEY_ID","new","PUSH_ENCRYPTION_KEYS","new="+key,"PUSH_INSTANCE_ID","a","PUSH_KEY_SECRET_VERSIONS","new=v2");
        var out=new ByteArrayOutputStream();
        assertThat(PushKeyOperator.run(new String[]{"status"},env,new PrintStream(out))).isZero();
        assertThat(out.toString()).contains("active=new","versions=new=v2").doesNotContain(key);
    }
}
