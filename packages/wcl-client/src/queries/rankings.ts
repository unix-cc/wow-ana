export const GET_ENCOUNTER_RANKINGS_QUERY = /* GraphQL */ `
  query GetEncounterRankings(
    $encounterID: Int!
    $className: String!
    $specName: String!
    $metric: CharacterRankingMetricType!
    $page: Int!
  ) {
    worldData {
      encounter(id: $encounterID) {
        name
        characterRankings(
          metric: $metric
          className: $className
          specName: $specName
          page: $page
        )
      }
    }
  }
`;
