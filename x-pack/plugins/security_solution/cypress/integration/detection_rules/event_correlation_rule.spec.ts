/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { formatMitreAttackDescription } from '../../helpers/rules';
import { getEqlRule, getEqlSequenceRule, getIndexPatterns } from '../../objects/rule';

import { ALERT_DATA_GRID, NUMBER_OF_ALERTS } from '../../screens/alerts';
import {
  CUSTOM_RULES_BTN,
  RISK_SCORE,
  RULE_NAME,
  RULES_ROW,
  RULES_TABLE,
  RULE_SWITCH,
  SEVERITY,
} from '../../screens/alerts_detection_rules';
import {
  ABOUT_DETAILS,
  ABOUT_INVESTIGATION_NOTES,
  ABOUT_RULE_DESCRIPTION,
  ADDITIONAL_LOOK_BACK_DETAILS,
  CUSTOM_QUERY_DETAILS,
  DEFINITION_DETAILS,
  FALSE_POSITIVES_DETAILS,
  getDetails,
  removeExternalLinkText,
  INDEX_PATTERNS_DETAILS,
  INVESTIGATION_NOTES_MARKDOWN,
  INVESTIGATION_NOTES_TOGGLE,
  MITRE_ATTACK_DETAILS,
  REFERENCE_URLS_DETAILS,
  RISK_SCORE_DETAILS,
  RULE_NAME_HEADER,
  RULE_TYPE_DETAILS,
  RUNS_EVERY_DETAILS,
  SCHEDULE_DETAILS,
  SEVERITY_DETAILS,
  TAGS_DETAILS,
  TIMELINE_TEMPLATE_DETAILS,
} from '../../screens/rule_details';

import {
  goToManageAlertsDetectionRules,
  waitForAlertsIndexToBeCreated,
  waitForAlertsPanelToBeLoaded,
} from '../../tasks/alerts';
import {
  changeRowsPerPageTo100,
  filterByCustomRules,
  goToCreateNewRule,
  goToRuleDetails,
  waitForRulesTableToBeLoaded,
} from '../../tasks/alerts_detection_rules';
import { createTimeline } from '../../tasks/api_calls/timelines';
import { cleanKibana } from '../../tasks/common';
import {
  createAndActivateRule,
  fillAboutRuleAndContinue,
  fillDefineEqlRuleAndContinue,
  fillScheduleRuleAndContinue,
  selectEqlRuleType,
  waitForAlertsToPopulate,
  waitForTheRuleToBeExecuted,
} from '../../tasks/create_new_rule';
import { loginAndWaitForPageWithoutDateRange } from '../../tasks/login';

import { ALERTS_URL } from '../../urls/navigation';

describe('Detection rules, EQL', () => {
  const expectedUrls = getEqlRule().referenceUrls.join('');
  const expectedFalsePositives = getEqlRule().falsePositivesExamples.join('');
  const expectedTags = getEqlRule().tags.join('');
  const expectedMitre = formatMitreAttackDescription(getEqlRule().mitre);
  const expectedNumberOfRules = 1;
  const expectedNumberOfAlerts = '7 alerts';

  beforeEach(() => {
    cleanKibana();
    createTimeline(getEqlRule().timeline).then((response) => {
      cy.wrap({
        ...getEqlRule(),
        timeline: {
          ...getEqlRule().timeline,
          id: response.body.data.persistTimeline.timeline.savedObjectId,
        },
      }).as('rule');
    });
  });

  it('Creates and activates a new EQL rule', function () {
    loginAndWaitForPageWithoutDateRange(ALERTS_URL);
    waitForAlertsPanelToBeLoaded();
    waitForAlertsIndexToBeCreated();
    goToManageAlertsDetectionRules();
    waitForRulesTableToBeLoaded();
    goToCreateNewRule();
    selectEqlRuleType();
    fillDefineEqlRuleAndContinue(this.rule);
    fillAboutRuleAndContinue(this.rule);
    fillScheduleRuleAndContinue(this.rule);
    createAndActivateRule();

    cy.get(CUSTOM_RULES_BTN).should('have.text', 'Custom rules (1)');

    changeRowsPerPageTo100();

    cy.get(RULES_TABLE).then(($table) => {
      cy.wrap($table.find(RULES_ROW).length).should('eql', expectedNumberOfRules);
    });

    filterByCustomRules();

    cy.get(RULES_TABLE).then(($table) => {
      cy.wrap($table.find(RULES_ROW).length).should('eql', 1);
    });
    cy.get(RULE_NAME).should('have.text', this.rule.name);
    cy.get(RISK_SCORE).should('have.text', this.rule.riskScore);
    cy.get(SEVERITY).should('have.text', this.rule.severity);
    cy.get(RULE_SWITCH).should('have.attr', 'aria-checked', 'true');

    goToRuleDetails();

    cy.get(RULE_NAME_HEADER).should('contain', `${this.rule.name}`);
    cy.get(ABOUT_RULE_DESCRIPTION).should('have.text', this.rule.description);
    cy.get(ABOUT_DETAILS).within(() => {
      getDetails(SEVERITY_DETAILS).should('have.text', this.rule.severity);
      getDetails(RISK_SCORE_DETAILS).should('have.text', this.rule.riskScore);
      getDetails(REFERENCE_URLS_DETAILS).should((details) => {
        expect(removeExternalLinkText(details.text())).equal(expectedUrls);
      });
      getDetails(FALSE_POSITIVES_DETAILS).should('have.text', expectedFalsePositives);
      getDetails(MITRE_ATTACK_DETAILS).should((mitre) => {
        expect(removeExternalLinkText(mitre.text())).equal(expectedMitre);
      });
      getDetails(TAGS_DETAILS).should('have.text', expectedTags);
    });
    cy.get(INVESTIGATION_NOTES_TOGGLE).click({ force: true });
    cy.get(ABOUT_INVESTIGATION_NOTES).should('have.text', INVESTIGATION_NOTES_MARKDOWN);
    cy.get(DEFINITION_DETAILS).within(() => {
      getDetails(INDEX_PATTERNS_DETAILS).should('have.text', getIndexPatterns().join(''));
      getDetails(CUSTOM_QUERY_DETAILS).should('have.text', this.rule.customQuery);
      getDetails(RULE_TYPE_DETAILS).should('have.text', 'Event Correlation');
      getDetails(TIMELINE_TEMPLATE_DETAILS).should('have.text', 'None');
    });
    cy.get(SCHEDULE_DETAILS).within(() => {
      getDetails(RUNS_EVERY_DETAILS).should(
        'have.text',
        `${this.rule.runsEvery.interval}${this.rule.runsEvery.type}`
      );
      getDetails(ADDITIONAL_LOOK_BACK_DETAILS).should(
        'have.text',
        `${this.rule.lookBack.interval}${this.rule.lookBack.type}`
      );
    });

    waitForTheRuleToBeExecuted();
    waitForAlertsToPopulate();

    cy.get(NUMBER_OF_ALERTS).should('have.text', expectedNumberOfAlerts);
    cy.get(ALERT_DATA_GRID)
      .invoke('text')
      .then((text) => {
        expect(text).contains(this.rule.name);
      });
  });
});

describe('Detection rules, sequence EQL', () => {
  const expectedNumberOfRules = 1;
  const expectedNumberOfSequenceAlerts = '1 alert';

  beforeEach(() => {
    cleanKibana();
    createTimeline(getEqlSequenceRule().timeline).then((response) => {
      cy.wrap({
        ...getEqlSequenceRule(),
        timeline: {
          ...getEqlSequenceRule().timeline,
          id: response.body.data.persistTimeline.timeline.savedObjectId,
        },
      }).as('rule');
    });
  });

  it.skip('Creates and activates a new EQL rule with a sequence', function () {
    loginAndWaitForPageWithoutDateRange(ALERTS_URL);
    waitForAlertsPanelToBeLoaded();
    waitForAlertsIndexToBeCreated();
    goToManageAlertsDetectionRules();
    waitForRulesTableToBeLoaded();
    goToCreateNewRule();
    selectEqlRuleType();
    fillDefineEqlRuleAndContinue(this.rule);
    fillAboutRuleAndContinue(this.rule);
    fillScheduleRuleAndContinue(this.rule);
    createAndActivateRule();

    cy.get(CUSTOM_RULES_BTN).should('have.text', 'Custom rules (1)');

    changeRowsPerPageTo100();

    cy.get(RULES_TABLE).then(($table) => {
      cy.wrap($table.find(RULES_ROW).length).should('eql', expectedNumberOfRules);
    });

    filterByCustomRules();
    goToRuleDetails();
    waitForTheRuleToBeExecuted();
    waitForAlertsToPopulate();

    cy.get(NUMBER_OF_ALERTS).should('have.text', expectedNumberOfSequenceAlerts);
    cy.get(ALERT_DATA_GRID)
      .invoke('text')
      .then((text) => {
        cy.log('ALERT_DATA_GRID', text);
        expect(text).contains(this.rule.name);
        expect(text).contains(this.rule.severity.toLowerCase());
        expect(text).contains(this.rule.riskScore);
      });
  });
});
