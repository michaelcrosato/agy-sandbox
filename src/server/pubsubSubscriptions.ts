import { Squad } from "./SquadManager.js";

/**
 * Registers global Redis/InMemory PubSub message subscribers.
 *
 * @param {object} options - Unified singletons and caches context.
 */
export async function registerPubSubSubscriptions(options) {
  const { pubsub, instances, wss, squadManager } = options;

  await pubsub.subscribe("chat:global", (payload) => {
    for (const room of instances.values()) {
      for (const c of room.clients.values()) {
        c.send(payload);
      }
    }
  });

  await pubsub.subscribe("chat:squad", (payload) => {
    const squadId = payload.squadId;
    for (const ws of wss.clients) {
      const c = ws.clientObj;
      if (c && squadManager.getSquadId(c.id) === squadId) {
        c.send(payload);
      }
    }
  });

  await pubsub.subscribe("squad:events", (payload) => {
    if (payload.type === "squad_invite") {
      for (const ws of wss.clients) {
        const c = ws.clientObj;
        if (
          c &&
          (c.id === payload.targetId ||
            (payload.targetNickname && c.nickname === payload.targetNickname))
        ) {
          c.send({
            type: "squad_invite_received",
            senderId: payload.senderId,
            senderNickname: payload.senderNickname,
            squadId: payload.squadId,
          });
        }
      }
    } else if (payload.type === "squad_update") {
      const { squadId, leaderId, memberIds } = payload;
      const squad = squadManager.squads.get(squadId);
      const oldMembers = squad ? Array.from(squad.memberIds) : [];

      if (memberIds.length === 0) {
        squadManager.squads.delete(squadId);
        for (const mId of oldMembers) {
          squadManager.playerToSquad.delete(mId);
          const localC = Array.from(wss.clients)
            .map((w: any) => w.clientObj)
            .find((c) => c && c.id === mId);
          if (localC) {
            localC.send({
              type: "notification",
              message: "Your squad has been dissolved.",
              style: "info",
            });
            localC.sendStats();
          }
        }
      } else {
        let sq = squadManager.squads.get(squadId);
        if (!sq) {
          sq = new Squad(squadId, leaderId);
          sq.memberIds = new Set(memberIds);
          squadManager.squads.set(squadId, sq);
        } else {
          sq.leaderId = leaderId;
          sq.memberIds = new Set(memberIds);
        }

        for (const mId of memberIds) {
          squadManager.playerToSquad.set(mId, squadId);
        }
        for (const mId of oldMembers) {
          if (!memberIds.includes(mId)) {
            squadManager.playerToSquad.delete(mId);
          }
        }

        if (oldMembers.length > 0) {
          const joinedId = memberIds.find((m) => !oldMembers.includes(m));
          if (joinedId) {
            let joinedNickname = "A player";
            const localJoined = Array.from(wss.clients)
              .map((w: any) => w.clientObj)
              .find((c) => c && c.id === joinedId);
            if (localJoined) {
              joinedNickname = localJoined.nickname;
            }

            for (const ws of wss.clients) {
              const c = ws.clientObj;
              if (c && memberIds.includes(c.id) && c.id !== joinedId) {
                c.send({
                  type: "notification",
                  message: `${joinedNickname} joined the squad!`,
                  style: "success",
                });
                c.sendStats();
              }
            }
          }

          const leftId = oldMembers.find((m) => !memberIds.includes(m));
          if (leftId) {
            let leftNickname = "A player";
            const localLeft = Array.from(wss.clients)
              .map((w: any) => w.clientObj)
              .find((c) => c && c.id === leftId);
            if (localLeft) {
              leftNickname = localLeft.nickname;
            }

            for (const ws of wss.clients) {
              const c = ws.clientObj;
              if (c && memberIds.includes(c.id)) {
                c.send({
                  type: "notification",
                  message: `${leftNickname} left the squad.`,
                  style: "info",
                });
                c.sendStats();
              }
            }
          }
        }
      }
    }
  });

  await pubsub.subscribe("faction:campaign", (payload) => {
    const { roomId, campaignState } = payload;
    const room = instances.get(roomId);
    if (room && room.factionWarCampaign) {
      room.factionWarCampaign.load(campaignState);
      room.broadcast({
        type: "faction_campaign_sync",
        campaign: campaignState,
      });
    }
  });
}
