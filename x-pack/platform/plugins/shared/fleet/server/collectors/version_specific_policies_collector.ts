/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, SavedObjectsClientContract } from '@kbn/core/server';

import { AGENTS_INDEX, SO_SEARCH_LIMIT } from '../../common';
import { agentPolicyService, getAgentPolicySavedObjectType } from '../services/agent_policy';
import { appContextService } from '../services';
import { AGENT_POLICY_VERSION_SEPARATOR } from '../constants';

export interface AgentOnVersionSpecificPolicy {
  agent_version: string;
  count: number;
}

export interface VersionSpecificPoliciesUsage {
  agent_policies_count: number;
  packages_with_agent_version_conditions: string[];
  agents_on_version_specific_policies_per_version: AgentOnVersionSpecificPolicy[];
}

const DEFAULT_USAGE: VersionSpecificPoliciesUsage = {
  agent_policies_count: 0,
  packages_with_agent_version_conditions: [],
  agents_on_version_specific_policies_per_version: [],
};

export const getVersionSpecificPoliciesUsage = async (
  soClient: SavedObjectsClientContract,
  esClient: ElasticsearchClient
): Promise<VersionSpecificPoliciesUsage> => {
  try {
    const agentPolicySavedObjectType = await getAgentPolicySavedObjectType();

    const agentPolicyFetcher = await agentPolicyService.fetchAllAgentPolicies(soClient, {
      perPage: SO_SEARCH_LIMIT,
      spaceId: '*',
      kuery: `${agentPolicySavedObjectType}.has_agent_version_conditions:true`,
      fields: ['package_agent_version_conditions'],
    });
    const packagesSet = new Set<string>();
    let policiesCount = 0;

    for await (const agentPolicyPageResults of agentPolicyFetcher) {
      if (!agentPolicyPageResults.length) {
        break;
      }
      policiesCount += agentPolicyPageResults.length;
      for (const policy of agentPolicyPageResults) {
        for (const dep of policy.package_agent_version_conditions ?? []) {
          packagesSet.add(dep.name);
        }
      }
    }
    const packagesWithAgentVersionConditions = Array.from(packagesSet);

    const response = await esClient.search({
      index: AGENTS_INDEX,
      size: 0,
      query: {
        bool: {
          filter: [
            { term: { active: 'true' } },
            { wildcard: { policy_id: `*${AGENT_POLICY_VERSION_SEPARATOR}*` } },
          ],
        },
      },
      aggs: {
        versions: {
          terms: { field: 'agent.version' },
        },
      },
    });

    const agentsOnVersionSpecificPoliciesPerVersion = (
      (response?.aggregations?.versions as any).buckets ?? []
    ).map((bucket: any) => ({
      agent_version: bucket.key,
      count: bucket.doc_count,
    }));

    return {
      agent_policies_count: policiesCount,
      packages_with_agent_version_conditions: packagesWithAgentVersionConditions,
      agents_on_version_specific_policies_per_version: agentsOnVersionSpecificPoliciesPerVersion,
    };
  } catch (error) {
    if (error.statusCode === 404) {
      appContextService.getLogger().debug('Index .fleet-agents does not exist yet.');
    } else {
      throw error;
    }
    return DEFAULT_USAGE;
  }
};
