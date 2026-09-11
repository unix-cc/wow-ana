export const GET_REPORT_QUERY = /* GraphQL */ `
  query GetReport($code: String!) {
    reportData {
      report(code: $code) {
        code
        title
        owner {
          id
          name
        }
        startTime
        endTime
        zone {
          id
          name
        }
      }
    }
  }
`;

export const GET_FIGHTS_QUERY = /* GraphQL */ `
  query GetFights($code: String!) {
    reportData {
      report(code: $code) {
        fights {
          id
          name
          startTime
          endTime
          difficulty
          kill
          encounterID
          gameZone {
            id
          }
          size
        }
      }
    }
  }
`;

export const GET_ACTORS_QUERY = /* GraphQL */ `
  query GetActors($code: String!) {
    reportData {
      report(code: $code) {
        masterData {
          actors {
            id
            name
            type
            subType
            server
            petOwner
          }
        }
      }
    }
  }
`;

/**
 * Bulk ability-name table for a report.
 *
 * Combat events only carry `abilityGameID` — the raw JSON blob WCL returns for
 * `events(dataType: Casts)` has no nested ability object, so `abilityName`
 * stays empty on normalized events. `masterData.abilities` closes that gap in
 * **one** query and, on the CN site, returns the official Chinese names
 * (verified live 2026-09-10). That makes it the right source for anything that
 * has to display ability names by id (e.g. the head-to-head comparison table),
 * instead of N calls to `gameData.ability(id)`.
 */
export const GET_ABILITY_NAMES_QUERY = /* GraphQL */ `
  query GetAbilityNames($code: String!) {
    reportData {
      report(code: $code) {
        masterData {
          abilities {
            gameID
            name
          }
        }
      }
    }
  }
`;

export const GET_FIGHT_FRIENDLIES_QUERY = /* GraphQL */ `
  query GetFightFriendlies($code: String!) {
    reportData {
      report(code: $code) {
        fights {
          id
          friendlyPlayers
          friendlySpecs
        }
      }
    }
  }
`;
