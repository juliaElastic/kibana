/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import * as React from 'react';
import { mountWithIntl, nextTick } from '@kbn/test/jest';
import { act } from 'react-dom/test-utils';
import { ExecutionDurationChart, padOrTruncateDurations } from './execution_duration_chart';

describe('execution duration chart', () => {
  it('renders empty state when no execution duration values are available', async () => {
    const executionDuration = mockExecutionDuration();

    const wrapper = mountWithIntl(<ExecutionDurationChart executionDuration={executionDuration} />);

    await act(async () => {
      await nextTick();
      wrapper.update();
    });

    expect(wrapper.find('[data-test-subj="executionDurationChartPanel"]').exists()).toBeTruthy();
    expect(wrapper.find('[data-test-subj="executionDurationChartEmpty"]').exists()).toBeTruthy();
    expect(wrapper.find('[data-test-subj="executionDurationChart"]').exists()).toBeFalsy();
  });

  it('renders chart when execution duration values are available', async () => {
    const executionDuration = mockExecutionDuration({ average: 10, values: [1, 2] });

    const wrapper = mountWithIntl(<ExecutionDurationChart executionDuration={executionDuration} />);

    await act(async () => {
      await nextTick();
      wrapper.update();
    });

    expect(wrapper.find('[data-test-subj="executionDurationChartPanel"]').exists()).toBeTruthy();
    expect(wrapper.find('[data-test-subj="executionDurationChartEmpty"]').exists()).toBeFalsy();
    expect(wrapper.find('[data-test-subj="executionDurationChart"]').exists()).toBeTruthy();
  });
});

describe('padOrTruncateDurations', () => {
  it('does nothing when array is the correct length', () => {
    expect(padOrTruncateDurations([1, 2, 3], 3)).toEqual([1, 2, 3]);
  });

  it('pads execution duration values when there are fewer than display desires', () => {
    expect(padOrTruncateDurations([1, 2, 3], 10)).toEqual([
      1,
      2,
      3,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it('truncates execution duration values when there are more than display desires', () => {
    expect(padOrTruncateDurations([1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13], 10)).toEqual([
      3, 5, 6, 7, 8, 9, 10, 11, 12, 13,
    ]);
  });
});

function mockExecutionDuration(
  overwrites: {
    average?: number;
    values?: number[];
  } = {}
) {
  return {
    average: 0,
    values: [],
    ...overwrites,
  };
}
