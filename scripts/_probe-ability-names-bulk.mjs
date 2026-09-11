/**
 * Does the report expose a bulk ability-name table? If `masterData.abilities`
 * works, one query names every ability in a comparison table — far better than
 * N calls to `gameData.ability(id)`.
 */
import { AuthManager, GraphqlClient, RateLimitManager } from '../packages/wcl-client/dist/index.js';

const auth = new AuthManager();
const graphql = new GraphqlClient({
  tokenProvider: auth,
  rateLimiter: new RateLimitManager(),
});

const attempts = [
  {
    label: 'report.masterData.abilities { gameID name }',
    query: `query { reportData { report(code: "fXdMjWKJbpna6yHv") { masterData { abilities { gameID name } } } } }`,
  },
  {
    label: 'report.masterData { abilities { gameID name icon type } }',
    query: `query { reportData { report(code: "fXdMjWKJbpna6yHv") { masterData { abilities { gameID name icon type } } } } }`,
  },
  {
    label: 'gameData.abilities(ids: [51505, 188389])',
    query: `query { gameData { abilities(ids: [51505, 188389]) { id name } } }`,
  },
];

for (const attempt of attempts) {
  try {
    const result = await graphql.request({ query: attempt.query });
    const json = JSON.stringify(result);
    console.log(`\n[OK] ${attempt.label}`);
    console.log(`  ${json.length > 400 ? `${json.slice(0, 400)}…` : json}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`\n[FAIL] ${attempt.label}`);
    console.log(`  ${message.slice(0, 300)}`);
  }
}
