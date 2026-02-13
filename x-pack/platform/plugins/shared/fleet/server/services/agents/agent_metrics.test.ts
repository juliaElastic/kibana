/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClientMock } from '@kbn/core/server/mocks';
import { elasticsearchServiceMock } from '@kbn/core/server/mocks';

import type { Agent } from '../../types';

import { fetchAndAssignAgentMetrics } from './agent_metrics';

const mockWarn = jest.fn();

jest.mock('../app_context', () => ({
  appContextService: {
    getLogger: () => ({
      warn: mockWarn,
    }),
  },
}));

const createAgent = (id: string, type: Agent['type']) =>
  ({
    id,
    type,
    active: true,
    enrolled_at: '2026-02-01T00:00:00.000Z',
    local_metadata: {},
    packages: [],
  } as Agent);

describe('fetchAndAssignAgentMetrics', () => {
  let esClient: ElasticsearchClientMock;

  beforeEach(() => {
    mockWarn.mockReset();
    esClient = elasticsearchServiceMock.createElasticsearchClient();
    esClient.search.mockReset();
  });

  it('fetches Fleet and OPAMP metrics from their respective indices', async () => {
    esClient.search
      .mockResolvedValueOnce({
        aggregations: {
          agents: {
            buckets: [
              {
                key: 'fleet-1',
                sum_memory_size: { value: 1234.99 },
                sum_cpu: { value: 0.123456 },
              },
            ],
          },
        },
      } as any)
      .mockResolvedValueOnce({
        aggregations: {
          agents: {
            buckets: [
              {
                key: 'opamp-1',
                avg_memory_size: { value: 4567.89 },
                avg_cpu: { value: 0.009876 },
              },
            ],
          },
        },
      } as any);

    const agents = [createAgent('fleet-1', 'PERMANENT'), createAgent('opamp-1', 'OPAMP')];
    const result = await fetchAndAssignAgentMetrics(esClient as any, agents);

    expect(esClient.search).toHaveBeenCalledTimes(2);

    expect(esClient.search).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        index: 'metrics-elastic_agent.*',
        query: expect.objectContaining({
          bool: expect.objectContaining({
            must: expect.arrayContaining([
              expect.objectContaining({
                terms: {
                  'elastic_agent.id': ['fleet-1'],
                },
              }),
            ]),
          }),
        }),
      })
    );

    expect(esClient.search).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        index: 'metrics-collectortelemetry.otel-*',
        query: expect.objectContaining({
          bool: expect.objectContaining({
            must: expect.arrayContaining([
              expect.objectContaining({
                terms: {
                  'service.instance.id': ['opamp-1'],
                },
              }),
            ]),
          }),
        }),
      })
    );

    expect(result).toEqual([
      expect.objectContaining({
        id: 'fleet-1',
        metrics: {
          cpu_avg: 0.12345,
          memory_size_byte_avg: 1234,
        },
      }),
      expect.objectContaining({
        id: 'opamp-1',
        metrics: {
          cpu_avg: 0.00987,
          memory_size_byte_avg: 4567,
        },
      }),
    ]);
  });

  it('returns the original agents and logs a warning when search fails', async () => {
    const error = new Error('forbidden');
    esClient.search.mockRejectedValueOnce(error);
    const agents = [createAgent('fleet-1', 'PERMANENT')];

    const result = await fetchAndAssignAgentMetrics(esClient as any, agents);

    expect(result).toEqual(agents);
    expect(mockWarn).toHaveBeenCalledWith(error);
  });
});
