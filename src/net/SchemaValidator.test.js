import { validateMessage } from "./SchemaValidator.js";

describe("SchemaValidator", () => {
  test("rejects invalid, null, or empty inputs", () => {
    expect(validateMessage(null).valid).toBe(false);
    expect(validateMessage(undefined).valid).toBe(false);
    expect(validateMessage("not an object").valid).toBe(false);
    expect(validateMessage({}).valid).toBe(false);
    expect(validateMessage({ type: "" }).valid).toBe(false);
    expect(validateMessage({ type: 123 }).valid).toBe(false);
    expect(validateMessage({ type: "unknown_type" }).valid).toBe(false);
  });

  test("accepts valid join and quick_join messages", () => {
    const joinMsg = {
      type: "join",
      sessionToken: "token-123",
      nickname: "Viper",
    };
    const res = validateMessage(joinMsg);
    expect(res.valid).toBe(true);
    expect(res.sanitized).toEqual({
      type: "join",
      sessionToken: "token-123",
      nickname: "Viper",
    });

    const joinOptional = { type: "join" };
    expect(validateMessage(joinOptional).valid).toBe(true);

    const qjMsg = { type: "quick_join", mode: "pvp", tags: ["expert", "hard"] };
    const qjRes = validateMessage(qjMsg);
    expect(qjRes.valid).toBe(true);
    expect(qjRes.sanitized.tags).toEqual(["expert", "hard"]);
  });

  test("rejects join message with invalid nickname or long nickname", () => {
    expect(validateMessage({ type: "join", nickname: 123 }).valid).toBe(false);
    expect(
      validateMessage({
        type: "join",
        nickname: "VeryLongNicknameThatExceedsTwentyChars Limit",
      }).valid,
    ).toBe(false);
  });

  test("accepts and sanitizes trade messages", () => {
    const tradeMsg = {
      type: "trade",
      planetName: "Sol Prime",
      commodity: "ore",
      amount: 15,
      buy: true,
      extraMaliciousKey: "injected",
    };
    const res = validateMessage(tradeMsg);
    expect(res.valid).toBe(true);
    // Extra key must be stripped!
    expect(res.sanitized.extraMaliciousKey).toBeUndefined();
    expect(res.sanitized).toEqual({
      type: "trade",
      planetName: "Sol Prime",
      commodity: "ore",
      amount: 15,
      buy: true,
    });
  });

  test("rejects trade messages with invalid values", () => {
    // Missing required field
    expect(
      validateMessage({
        type: "trade",
        commodity: "ore",
        amount: 15,
        buy: true,
      }).valid,
    ).toBe(false);
    // Negative amount
    expect(
      validateMessage({
        type: "trade",
        planetName: "Sol Prime",
        commodity: "ore",
        amount: -5,
        buy: true,
      }).valid,
    ).toBe(false);
    // Decimal amount
    expect(
      validateMessage({
        type: "trade",
        planetName: "Sol Prime",
        commodity: "ore",
        amount: 3.14,
        buy: true,
      }).valid,
    ).toBe(false);
    // String instead of boolean
    expect(
      validateMessage({
        type: "trade",
        planetName: "Sol Prime",
        commodity: "ore",
        amount: 5,
        buy: "true",
      }).valid,
    ).toBe(false);
  });

  test("accepts and sanitizes chat messages", () => {
    const chatMsg = { type: "chat", text: "Hello Sector!", channel: "global" };
    expect(validateMessage(chatMsg).valid).toBe(true);

    const longChat = {
      type: "chat",
      text: "A".repeat(101),
    };
    expect(validateMessage(longChat).valid).toBe(false);
  });

  test("accepts and sanitizes controls messages", () => {
    const controlsMsg = {
      type: "controls",
      keys: { up: true, space: false },
      heading: 1.57,
      warp: false,
    };
    const res = validateMessage(controlsMsg);
    expect(res.valid).toBe(true);
    expect(res.sanitized.keys).toEqual({ up: true, space: false });
    expect(res.sanitized.heading).toBe(1.57);

    // Non-finite heading
    expect(
      validateMessage({
        type: "controls",
        heading: NaN,
      }).valid,
    ).toBe(false);
    expect(
      validateMessage({
        type: "controls",
        heading: Infinity,
      }).valid,
    ).toBe(false);
  });

  test("accepts parameter-free messages", () => {
    expect(validateMessage({ type: "launch" }).valid).toBe(true);
    expect(validateMessage({ type: "port_refine" }).valid).toBe(true);
    expect(validateMessage({ type: "squad_leave" }).valid).toBe(true);
    expect(validateMessage({ type: "ping" }).valid).toBe(true);
  });

  test("rejects invalid tags array elements", () => {
    expect(
      validateMessage({
        type: "quick_join",
        tags: ["fine", 123],
      }).valid,
    ).toBe(false);
  });

  test("rejects injection, shell metacharacters, and path traversal strings in critical fields", () => {
    // Path traversal in roomName
    const roomTraversal = {
      type: "create_room",
      roomName: "../../../etc/passwd",
    };
    const res1 = validateMessage(roomTraversal);
    expect(res1.valid).toBe(false);
    expect(res1.error).toContain("Security warning");

    // Shell injection in nickname
    const nickShell = {
      type: "join",
      nickname: "pilot; rm -rf /",
    };
    const res2 = validateMessage(nickShell);
    expect(res2.valid).toBe(false);
    expect(res2.error).toContain("Security warning");

    // SQL comments in presetName
    const presetSql = {
      type: "preset_save",
      presetName: "preset' --",
    };
    const res3 = validateMessage(presetSql);
    expect(res3.valid).toBe(false);
    expect(res3.error).toContain("Security warning");

    // Path separators in roomId
    const roomPath = {
      type: "join_room",
      roomId: "rooms/public",
    };
    const res4 = validateMessage(roomPath);
    expect(res4.valid).toBe(false);
    expect(res4.error).toContain("Security warning");
  });
});
