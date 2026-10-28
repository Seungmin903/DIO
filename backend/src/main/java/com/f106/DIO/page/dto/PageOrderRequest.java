package com.f106.DIO.page.dto;
import java.util.*;
import jakarta.validation.constraints.*;
public record PageOrderRequest(@NotEmpty List<@NotNull UUID> pageIds) { }
