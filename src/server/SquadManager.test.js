import { SquadManager } from "./SquadManager.js";

describe("SquadManager (spec 059)", () => {
  let manager;

  beforeEach(() => {
    manager = new SquadManager();
  });

  test("creates a squad successfully and assigns player as leader", () => {
    const squad = manager.createSquad("p1");
    expect(squad).toBeDefined();
    expect(squad.leaderId).toBe("p1");
    expect(squad.memberIds.has("p1")).toBe(true);
    expect(manager.getSquadId("p1")).toBe(squad.id);
  });

  test("allows players to join an existing squad up to a max of 4", () => {
    const squad = manager.createSquad("p1");

    expect(manager.joinSquad(squad.id, "p2").success).toBe(true);
    expect(manager.joinSquad(squad.id, "p3").success).toBe(true);
    expect(manager.joinSquad(squad.id, "p4").success).toBe(true);

    // Squad is now full (4 members: p1, p2, p3, p4)
    const result = manager.joinSquad(squad.id, "p5");
    expect(result.success).toBe(false);
    expect(result.reason).toContain("full");
    expect(squad.memberIds.size).toBe(4);
  });

  test("assigns next member as leader if leader leaves", () => {
    const squad = manager.createSquad("p1");
    manager.joinSquad(squad.id, "p2");
    manager.joinSquad(squad.id, "p3");

    expect(squad.leaderId).toBe("p1");

    manager.leaveSquad("p1");
    expect(squad.leaderId).toBe("p2");
    expect(squad.memberIds.size).toBe(2);
  });

  test("dissolves empty squads completely when all members leave", () => {
    const squad = manager.createSquad("p1");
    expect(manager.squads.size).toBe(1);

    manager.leaveSquad("p1");
    expect(manager.squads.size).toBe(0);
  });
});
