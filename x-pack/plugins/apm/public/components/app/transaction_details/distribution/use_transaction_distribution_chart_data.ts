/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useEffect, useMemo } from 'react';

import { i18n } from '@kbn/i18n';

import { DEFAULT_PERCENTILE_THRESHOLD } from '../../../../../common/search_strategies/constants';
import { RawSearchStrategyClientParams } from '../../../../../common/search_strategies/types';
import { EVENT_OUTCOME } from '../../../../../common/elasticsearch_fieldnames';
import { EventOutcome } from '../../../../../common/event_outcome';

import { useApmPluginContext } from '../../../../context/apm_plugin/use_apm_plugin_context';
import { useApmServiceContext } from '../../../../context/apm_service/use_apm_service_context';
import { useLegacyUrlParams } from '../../../../context/url_params_context/use_url_params';
import { useApmParams } from '../../../../hooks/use_apm_params';
import { useFetcher, FETCH_STATUS } from '../../../../hooks/use_fetcher';
import { useTimeRange } from '../../../../hooks/use_time_range';

import type { TransactionDistributionChartData } from '../../../shared/charts/transaction_distribution_chart';

import { isErrorMessage } from '../../correlations/utils/is_error_message';

function hasRequiredParams(params: RawSearchStrategyClientParams) {
  const { serviceName, environment, start, end } = params;
  return serviceName && environment && start && end;
}

export const useTransactionDistributionChartData = () => {
  const { serviceName, transactionType } = useApmServiceContext();

  const {
    core: { notifications },
  } = useApmPluginContext();

  const { urlParams } = useLegacyUrlParams();
  const { transactionName } = urlParams;

  const {
    query: { kuery, environment, rangeFrom, rangeTo },
  } = useApmParams('/services/{serviceName}/transactions/view');

  const { start, end } = useTimeRange({ rangeFrom, rangeTo });

  const params = useMemo(
    () => ({
      serviceName,
      transactionName,
      transactionType,
      kuery,
      environment,
      start,
      end,
    }),
    [
      serviceName,
      transactionName,
      transactionType,
      kuery,
      environment,
      start,
      end,
    ]
  );

  const {
    // TODO The default object has `log: []` to retain compatibility with the shared search strategies code.
    // Remove once the other tabs are migrated away from search strategies.
    data: overallLatencyData = { log: [] },
    status: overallLatencyStatus,
    error: overallLatencyError,
  } = useFetcher(
    (callApmApi) => {
      if (hasRequiredParams(params)) {
        return callApmApi({
          endpoint: 'POST /internal/apm/latency/overall_distribution',
          params: {
            body: {
              ...params,
              percentileThreshold: DEFAULT_PERCENTILE_THRESHOLD,
            },
          },
        });
      }
    },
    [params]
  );

  useEffect(() => {
    if (isErrorMessage(overallLatencyError)) {
      notifications.toasts.addDanger({
        title: i18n.translate(
          'xpack.apm.transactionDetails.distribution.latencyDistributionErrorTitle',
          {
            defaultMessage:
              'An error occurred fetching the overall latency distribution.',
          }
        ),
        text: overallLatencyError.toString(),
      });
    }
  }, [overallLatencyError, notifications.toasts]);

  const overallLatencyHistogram =
    overallLatencyData.overallHistogram === undefined &&
    overallLatencyStatus !== FETCH_STATUS.LOADING
      ? []
      : overallLatencyData.overallHistogram;
  const hasData =
    Array.isArray(overallLatencyHistogram) &&
    overallLatencyHistogram.length > 0;

  // TODO The default object has `log: []` to retain compatibility with the shared search strategies code.
  // Remove once the other tabs are migrated away from search strategies.
  const { data: errorHistogramData = { log: [] }, error: errorHistogramError } =
    useFetcher(
      (callApmApi) => {
        if (hasRequiredParams(params)) {
          return callApmApi({
            endpoint: 'POST /internal/apm/latency/overall_distribution',
            params: {
              body: {
                ...params,
                percentileThreshold: DEFAULT_PERCENTILE_THRESHOLD,
                termFilters: [
                  {
                    fieldName: EVENT_OUTCOME,
                    fieldValue: EventOutcome.failure,
                  },
                ],
              },
            },
          });
        }
      },
      [params]
    );

  useEffect(() => {
    if (isErrorMessage(errorHistogramError)) {
      notifications.toasts.addDanger({
        title: i18n.translate(
          'xpack.apm.transactionDetails.distribution.failedTransactionsLatencyDistributionErrorTitle',
          {
            defaultMessage:
              'An error occurred fetching the failed transactions latency distribution.',
          }
        ),
        text: errorHistogramError.toString(),
      });
    }
  }, [errorHistogramError, notifications.toasts]);

  const transactionDistributionChartData: TransactionDistributionChartData[] =
    [];

  if (Array.isArray(overallLatencyHistogram)) {
    transactionDistributionChartData.push({
      id: i18n.translate(
        'xpack.apm.transactionDistribution.chart.allTransactionsLabel',
        { defaultMessage: 'All transactions' }
      ),
      histogram: overallLatencyHistogram,
    });
  }

  if (Array.isArray(errorHistogramData.overallHistogram)) {
    transactionDistributionChartData.push({
      id: i18n.translate(
        'xpack.apm.transactionDistribution.chart.allFailedTransactionsLabel',
        { defaultMessage: 'All failed transactions' }
      ),
      histogram: errorHistogramData.overallHistogram,
    });
  }

  return {
    chartData: transactionDistributionChartData,
    hasData,
    percentileThresholdValue: overallLatencyData.percentileThresholdValue,
    status: overallLatencyStatus,
  };
};
