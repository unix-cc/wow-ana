export const GET_EVENTS_QUERY = /* GraphQL */ `
  query GetEvents(
    $code: String!
    $startTime: Float!
    $endTime: Float!
    $sourceID: Int
    $targetID: Int
    $abilityID: Float
    $dataType: EventDataType
    $fightIDs: [Int!]
    $limit: Int
  ) {
    reportData {
      report(code: $code) {
        events(
          startTime: $startTime
          endTime: $endTime
          sourceID: $sourceID
          targetID: $targetID
          abilityID: $abilityID
          dataType: $dataType
          fightIDs: $fightIDs
          limit: $limit
        ) {
          data
          nextPageTimestamp
        }
      }
    }
  }
`;
