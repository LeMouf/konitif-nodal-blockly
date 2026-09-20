import { structuredScenario } from './structuredFixture.mjs';
import { dialect as values, contributions as valueContributions, number, sum } from './fixtures.mjs';
import { projectBlocklyWorkflow, proposeBlocklyEdit } from '../dist/index.js';

export function mixedScenario() {
  const fixture = structuredScenario();
  fixture.snapshot.dialect = { ...fixture.snapshot.dialect,
    nodeRegistry: [...fixture.snapshot.dialect.nodeRegistry, ...values.nodeRegistry] };
  fixture.contributions = [...fixture.contributions,
    ...valueContributions.map(c => ({ ...c, dialectId: fixture.snapshot.dialect.id }))];
  const proposal = proposeBlocklyEdit(fixture.snapshot, fixture.contributions,
    [...projectBlocklyWorkflow(fixture.snapshot, fixture.contributions).blocks, number('scalar', 4), sum('sum', 'scalar', null)]);
  if (!proposal.accepted) throw new Error(proposal.reason);
  fixture.snapshot.workflow = proposal.candidate;
  return fixture;
}
