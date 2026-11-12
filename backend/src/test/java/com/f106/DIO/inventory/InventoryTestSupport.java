package com.f106.DIO.inventory;

/** Existing isolated service tests mock the new collaborator; InventoryPolicyTests verifies the real limits. */
public final class InventoryTestSupport {
    private InventoryTestSupport() {}
    public static <T> T withQuotaMock(T service) {
        org.springframework.test.util.ReflectionTestUtils.setField(service,"inventory",org.mockito.Mockito.mock(InventoryLimits.class));
        return service;
    }
}
