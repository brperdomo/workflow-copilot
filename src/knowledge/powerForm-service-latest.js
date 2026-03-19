import forEach from 'lodash/forEach';
import clone from 'ramda/src/clone';
import moment from 'moment';

import intQuestionGrid from '../../components/question/type/grid/intQuestionGrid';
import { errorLib, serviceClient, restRequest } from '@portal/commonLib';

export function PowerFormService(
  $http,
  $log,
  $location,
  UtilsService,
  UserService,
  ContactService,
  Settings,
  $q,
  $timeout,
  $rootScope
) {
  'ngInject';

  const baseUrl = `${Settings.nodeRoot}/tasktypes/power-form/`;

  function getDateFormat() {
    let currentUser = UserService.currentUser;
    let globalDateFormat = currentUser.Properties.DateFormat;

    //Take out time
    let dateFormatParts = globalDateFormat.split(' ');
    globalDateFormat = dateFormatParts[0];

    //Capitalize: pikaday can't interpret lowercase letters (e.g. yyyy-mm-dd)
    globalDateFormat = globalDateFormat.toUpperCase();

    return globalDateFormat;
  }

  function getRuntimeUrl(params) {
    var url = `${Settings.nodeRoot}/tasktypes/${params.recipientTaskSid
      }/power-form/runtime/${params.baseTaskSid}?process_sid=${params.processSid
      }&instance_sid=${params.instanceSid || ''}`;
    //console.log(url);
    return url;
  }

  //To disable/enable form builder controls (tabs, drag and drop) when the builder is loading
  function disableFormBuilderControls(someBool) {
    $rootScope.$broadcast('formBuilder_apiCallRunning', {
      disable: someBool
    });
  }

  /**
   * drills down powerform object and loops through its questions
   * @param {*} powerform
   * @param {*} func - function(item) { whatever you want to do to the item, which in most cases is a question (if item.type === 'Question_Type') }
   */
  function forEachItem(powerform, func) {
    angular.forEach(powerform?.layout, function (section) {
      angular.forEach(section?.contents, function (container) {
        angular.forEach(container?.columns, function (column) {
          angular.forEach(column?.items, func);
        });
      });
    });
  }

  function getQuestions(powerform) {
    var questions = [];

    forEachItem(powerform, function (item) {
      if (item.type === 'Question_Type') {
        questions.push(item);
      }
    });

    return questions;
  }

  function getLayoutElements(powerform, filterByQuestionType) {
    var layoutElements = [];

    forEachItem(powerform, function (item) {
      if (item.type === 'FormTool_Type') {
        if (!filterByQuestionType) {
          layoutElements.push(item);
        } else if (filterByQuestionType && item.QuestionType === filterByQuestionType) {
          layoutElements.push(item);
        }
      }
    });

    return layoutElements;
  }

  // Returns question by ClientID or ID
  function getQuestionBy(powerform, questionID, id_or_ClientID) {
    var question = null;

    forEachItem(powerform, function (item) {
      if (item.type === 'Question_Type' && item[id_or_ClientID] == questionID) {
        question = item;
      }
    });

    return question;
  }

  /* Returns Sections, Questions, or Form Tools by either ClientID or id */
  function getElementBy(powerform, elementID, id_or_ClientID) {
    var element = null;
    if (!id_or_ClientID) {
      id_or_ClientID = 'id';
    }

    angular.forEach(powerform.layout, section => {
      //Section
      if (section[id_or_ClientID] == elementID) {
        element = section;
      }

      //Container
      angular.forEach(section.contents, function (container) {
        if (container[id_or_ClientID] == elementID) {
          element = container;
        }

        // Items
        angular.forEach(container.columns, function (column) {
          angular.forEach(column.items, function (item) {
            if (item[id_or_ClientID] && item[id_or_ClientID] == elementID) {
              element = item;
            }
          });
        });
      });
    });

    return element;
  }

  /* Get List of Query Params:
    Takes in a powerform, and returns to you a list of all query params (except @search) in the form */
  function getListOfQueryParams(powerform) {
    var queryparams = [];

    forEachItem(powerform, function (item) {
      //Searchbox
      if (item.QuestionType === 'SearchBox') {
        // parameter name starts immediately after @ symbol
        var queryArray = item.dbSettings.Query.split(/[^a-zA-Z0-9_$#@][@]{1}/gi);

        for (var i = 1; i < queryArray.length; i++) {
          // try to isolate parameter name
          if (queryArray[i] && queryArray[i - 1] !== '') {
            // Rules for regular identifiers in SQL https://learn.microsoft.com/en-us/sql/relational-databases/databases/database-identifiers?view=sql-server-ver16
            let regex = /^[a-zA-Z_]{1}[a-zA-Z0-9_@$#]*/gi;
            let parameterName = queryArray[i].match(regex);
            // do not include @search
            if (parameterName && parameterName[0].toLowerCase() !== 'search') queryparams.push(parameterName[0]);
          }
        } //end for
      }
    });

    return queryparams;
  }

  function questionsLoaded(powerform) {
    var deferred = $q.defer();
    var iterations = 0;

    var refreshIntervalId = setInterval(() => {
      var loaded = true;

      forEachItem(powerform, function (item) {
        if (item.type === 'Question_Type') {
          var question = item;

          if (!question.loaded) {
            loaded = false;
          }
        }
      });

      if (!loaded && iterations < 50) {
        iterations++;
      } else {
        clearInterval(refreshIntervalId);
        deferred.resolve();
      }
    }, 250);

    return deferred.promise;
  }

  /* Append Query Params to Questions with dbSettings  *
    Called once Powerform & Task Configs return in "components/task/type/runtime/powerform/intTaskPowerForm" */
  function appendQueryParamsToDbQuestions(powerform, queryParams) {
    forEachItem(powerform, function (item) {
      if (item.dbSettings) {
        item.dbSettings.queryParams = queryParams;
      }
    });
  }

  function applySearchBoxMappings(powerform, row, mappings) {
    forEachItem(powerform, function (item) {
      if (item.type === 'Question_Type') {
        // Loop through mappings
        mappings.forEach(function (map) {
          if (map.ClientID == item.ClientID) {
            item.Answer = row[map.ColumnName]; //$log.info('thing.Answer: ', thing.Answer);
          }
        });
      }
    });
  }

  function applyAIBoxMappings(powerform, result, mappings) {
    forEachItem(powerform, function (item) {
      if (item.type === 'Question_Type') {
        mappings.forEach(async function (map) {
          if (map.ClientID == item.ClientID) {
            if (item.QuestionType === 'DbSelectList' && item.multiple) {
              item.multiChoiceAnswer = result[map.ColumnName]?.split(",").map(item => item.trim());
              item.Answer = item.multiChoiceAnswer.join(", ");
              if (item.events.onChange) {
                item.events.onChange(item.Answer);
              }
            }
            else if (item.QuestionType === 'ContactSearch' || item.QuestionType === 'MultiContactSearch') {
              const contactSearchResult = await ContactService.quickSearch({
                filter: result[map.ColumnName]
              });
              if (contactSearchResult?.FriendlyItems?.length > 0) {

                item.Answer = contactSearchResult.FriendlyItems;

                this.$rootScope.$broadcast(
                  'contactSearch_selectedContacts',
                  contact,
                  item.source
                );
              }
            } else {
              item.Answer = result[map.ColumnName];
            }
          }
        });
      }
    });
  }

  //DataType for Fields to Capture
  function getGenericType(QuestionType) {
    if (QuestionType.indexOf('FileAttachment') > -1 || QuestionType === 'AIBox') {
      return 'fileattachment';
    } else if (QuestionType === 'Calendar') {
      //single & multi file
      return 'date';
    } else if (QuestionType === 'Number') {
      // OP: I think this is the source of the 'number' values showing up in PROCESS_TASK_MAPPING.DATA_TYPE
      return 'numeric'; // number'; //
    } else {
      return 'string';
    }
  }

  //DataType for Runtime Submit
  function getRuntimeSubmitDataType(QuestionType) {
    //if (QuestionType.indexOf("fileattachment") > -1) { return 'FileAttachment'; }
    if (QuestionType === 'Calendar') {
      return 'DateTime';
    } else if (QuestionType === 'Number') {
      return 'Numeric';
    } else {
      return 'string';
    }
  }

  function getTopElement(inputs) {
    const topEl = Object.keys(inputs).reduce((acc, curr) => {
      if (
        inputs[curr].offset &&
        inputs[curr].offset.top < inputs[acc].offset.top
      ) {
        acc = curr;
      }
      return acc;
    });

    return inputs[topEl];
  }

  //serializes native form errors into a uniform object
  function serializeFormErrors(errors) {
    const errorObject = {};
    for (let type in errors) {
      if (errors[type] instanceof Array) {
        const errs = errors[type];
        errs.forEach(err => {
          if (!errorObject[err.$name]) {
            errorObject[err.$name] = {
              selector: `[name='${err.$name}']`,
              type: 'native',
              validationsFailed: [err]
            };
          } else {
            errorObject[err.$name].validationsFailed.push(err);
          }
        });
      }
    }
    return errorObject;
  }

  //serializes custom form errors into a uniform object
  function serializeCustomErrors(errors) {
    return (
      Object.keys(errors).reduce((acc, curr) => {
        if (!acc[curr]) {
          acc[curr] = {
            selector: `[id='${errors[curr].ClientID}']`,
            type: 'custom'
          };
        } else {
          console.log('error already set...');
        }
        return acc;
      }, {}) || {}
    );
  }

  return {
    disableFormBuilderControls: function (someBool) {
      return disableFormBuilderControls(someBool);
    },

    //Called the instant you create a Power Form Object (in admin/object/save/save.js)
    //And with the detail page's Copy Button, from (components/object/detail/intObjectDetail-directive.js)
    createNewPowerForm: function (params) {
      return $http.post(baseUrl, params).then(
        newPowerform => {
          return newPowerform.data;
        },
        error => {
          $log.error(error);
        }
      );
    },

    deletePowerForm: function (sid) {
      let url = baseUrl + '' + sid + '/builder';
      return $http.delete(url);
    },

    getDetail: function (sid) {
      let url = `${baseUrl}${sid}/detail`;
      return $http.get(url);
    },

    saveDetailPage: function (page) {
      let detailDelta = page.questions.reduce(
        (acc, question) => {
          let array = [];
          if (
            question.OriginalAnswer !== question.Answer &&
            question.ID !== 'Attachments'
          ) {
            if (question.ID === 'CategorySID') {
              array.push(question.ID, question.SID);
              acc.push(array);
            } else {
              array.push(question.ID, question.Answer);
              acc.push(array);
            }
          }
          return acc;
        },
        [['SID', page.sid]]
      );
      if (detailDelta.length === 1)
        detailDelta.push(['ID', page.questions[0].Answer]);

      //JSON version for node
      var jsonDelta = UtilsService.getLegitJsonFromArrays(detailDelta);

      var nodeParams = {
        sid: jsonDelta.SID //sid is constant
      };

      //These changes may or may not be in the delta
      if (jsonDelta.Name) {
        nodeParams.name = jsonDelta.Name;
      }
      if (jsonDelta.CategorySID) {
        nodeParams.categorySid = jsonDelta.CategorySID;
      }

      var params = {
        node: nodeParams, // json object
        wcf: detailDelta //array of arrays
      };

      var url = baseUrl + '' + params.node.sid + '/detail';
      return $http.put(url, params);
    },

    questionsLoaded: function (powerform) {
      return questionsLoaded(powerform);
    },

    getLayoutElements: function (powerform, filterByQuestionType) {
      return getLayoutElements(powerform, filterByQuestionType);
    },

    getQuestion: function (powerFormSid, questionClientID) {
      return $http
        .get(`${baseUrl}${powerFormSid}/questions/${questionClientID}`)
        .then(res => res.data);
    },

    getQuestions: function (powerform) {
      return getQuestions(powerform);
    },

    getQuestionBy: function (powerform, questionID, id_or_ClientID) {
      return getQuestionBy(powerform, questionID, id_or_ClientID);
    },

    getElementByID: function (powerform, elementID) {
      return getElementBy(powerform, elementID, 'id');
    },

    getElementByClientID: function (powerform, elementID) {
      return getElementBy(powerform, elementID, 'ClientID');
    },

    generateUniqueID: function() {
      return crypto.randomUUID();
    },

    getListOfQueryParams: function (powerform) {
      return getListOfQueryParams(powerform);
    },

    appendQueryParamsToDbQuestions: function (powerform, queryParams) {
      return appendQueryParamsToDbQuestions(powerform, queryParams);
    },

    applySearchBoxMappings: function (powerform, row, mappings) {
      applySearchBoxMappings(powerform, row, mappings);
    },

    applyAIBoxMappings: function (powerform, result, mappings) {
      applyAIBoxMappings(powerform, result, mappings);
    },

    applyRESTRequestMappings: function (powerform, result, mappings) {
      restRequest.applyMappings(powerform, result, mappings);
    },

    openPowerform: function (formSid) {
      var url = baseUrl + '' + formSid + '/builder';
      return $http.get(url).then(powerform => {
        return powerform.data;
      });
    },

    saveFormAttachment: function (params) {
      var url = baseUrl + '' + params.formSid + '/attachments/save';
      return $http.post(url, params).then(res => {
        return res.data;
      });
    },

    openPowerformRuntime: function (params) {
      // don't use back ticks if you break the url assignment across multiple lines.
      // all that whitespace will be sent to the backend and bad things will happen.
      var url = `${baseUrl}${params.formSid}/${params.recipientTaskSID}/${params.recipientTaskBaseTaskSID}/${params.copiedParentSid}/runtime/${params.isPreview}/${params.isReadOnly}/${params.requestSid}`;
      var paramAdded = false;
      if (params.clientSid) {
        url = url + `?clientSid=${params.clientSid}`;
        paramAdded = true; // ensure we only add one ?
      }
      if(params.draftFormView && params.draftFormView === true) {
        if (paramAdded) {
          url = url + '&draftFormView=true';
        } else {
          url = url + '?draftFormView=true';
          paramAdded = true; // ensure we only add one ?
        }
      }else{
        if (paramAdded) {
          url = url + '&draftFormView=false';
        } else {
          url = url + '?draftFormView=false';
          paramAdded = true; // ensure we only add one ?
        }
      }

      return $http.get(url).then(powerform => {
        if ($location.search().expandOnLoad === 'true') {
          for (const section of powerform?.data?.layout ?? []) {
            if (section.expandOnLoad === false) {
              section.expandOnLoad = true;
            }
          }
        }

        this.initTodaysDateToCalendar(powerform.data, params.isReadOnly);
        powerform.data.requestSid = params.requestSid;
        return powerform.data;
      });
    },

    initTodaysDateToCalendar(powerform, isReadOnly) {
      forEachItem(powerform, (item) => {
        if (item.type === 'Question_Type' &&
          item.QuestionType === "Calendar" &&
          !isReadOnly &&
          item.initializeWithTodaysDate &&
          !item.Answer // don't override selected prefills
        ) {
          const now = moment();
          item.Answer = now.format("YYYY-MM-DD");
        }
      });
    },

    //Returns css, js, or both accordingly
    getPowerFormCode: function (params) {
      // where codeType == 'script', 'css', or 'both'
      var url = baseUrl + '' + params.formSid + '/code/' + params.codeType;
      return $http.get(url).then(powerformCode => {
        return powerformCode.data;
      });
    },
    /* Update Specific Property:
            updates a specific property on powerforms (name, catSid, isTemplate, etc...)
            params.sid:        XXXX-XXXX-XXXX-XXXX-XXXX,
            params.updateThis: { desiredProperty: desiredValue }  */
    updateSpecificProperty: function (params, success) {
      var url = baseUrl + '' + params.sid + '/updateSpecificProperty';
      $http.put(url, params).then(success);
    },

    forEachItem(powerform, func) {
      forEachItem(powerform, func);
    },

    // params = {powerform, taskSid, processSid, instanceSid, recipientTaskSid}
    submit: function (params) {
      //here bcs hidden calendars will not have access to this question-side
      let globalDateFormat = getDateFormat();

      var postData = {
        isDraft: params.isDraft,
        request_name: params.requestName,
        parent_sid: params.copiedParentSid,
        client_sid: params.clientSid,
        questions: []
      };

      angular.forEach(getQuestions(params.powerform), function (question) {
        // OP: not a fan of if / else blocks like this.
        // They grow over time and lead to gigantic files (like this one)
        // Back when we had the legacy form, each question directive used to have a
        // getActionData (v6 terminology) function which handled things like this.
        // Then it'd just be a matter of looping through the questions and simply calling
        // getActionData for each one before form submit.  intQuestion had a generic method that worked for most
        // cases and each question could override it for their own specific implemenation.
        // That pattern is more maintainable
        // https://github.com/Integrify/angular-one-portal/blob/bfea555d245f9082687d58a171de6d5ce8592c6a/src/app/components/question/type/fileattachment/intQuestionFileAttachment-directive.js#L59

        let formattedQuestionObject = {
          key: question.id, //unique identifier to match with fields to capture
          label: question.Label,
          value: question.Answer,
          dom_id: question.ClientID, //KME, this value will go in DATA_CLIENT_ID in INSTANCE_DATA
          type: getRuntimeSubmitDataType(question.QuestionType),
          QuestionType: question.QuestionType
        };

        if (question.QuestionType === 'Calendar') {
          let answer = question.Answer || '';

          if (answer) {
            //       moment(currentAnswer, formatItsInNow).format(formatThatWeWant)
            answer = moment(answer, globalDateFormat).format('YYYY-MM-DD') || '';
          } else {
            //Back end needs empty answers to be empty strings
            answer = '';
          }
          formattedQuestionObject.value = answer;
        }

        //Ensure that each static or dynamic option goes into Answer property nicely
        if (question.QuestionType.includes('Checkbox')) {
          let answers = [];
          angular.forEach(question.Choices, choice => {
            if (choice.Selected == true) {
              answers.push(choice.Value);
            }
          });
          formattedQuestionObject.value = answers.join('|');
        }

        if (question.QuestionType === 'Grid') {
          if (question.formatForSubmit) {
            formattedQuestionObject.value = question.formatForSubmit();
          } else {
            const gridQuestion = new intQuestionGrid.controller(); // intQuestionGrid.default || intQuestionGrid
            gridQuestion.question = question;
            formattedQuestionObject.value = gridQuestion.formatForSubmit();
          }
        }

        if (question.QuestionType === 'SearchBox') {
          formattedQuestionObject.meta_1 = question.friendlyAnswer;
          formattedQuestionObject.meta_2 = 'SearchBox';
          if (question.Answer) {
            //Back end only accepts a string for some reason.
            formattedQuestionObject.value = question.Answer.toString();
          }
        }

        postData.questions.push(formattedQuestionObject);
      });

      return $http.post(getRuntimeUrl(params), postData).then(response => {
        let result = response.data;

        parent.postMessage(result, '*'); // needed by integrify embedder

        return result;
      }, (error) => {
        if (error?.status === 504) {
          // gateway timeout
          if (params?.instanceSid) {
            let result = {
              instance_sid: params.instanceSid,
              nextTasks: []
            };

            parent.postMessage(result, '*'); // needed by integrify embedder

            return result;
          }
        }

        alert(errorLib.getErrorMessage(error));
      });
    },

    submitButtonPressed: function (
      formEvents,
      integrifyForm,
      validateAndSubmit
    ) {
      // custom onSubmit function is defined
      if (angular.isDefined(formEvents.onSubmit)) {
        var stringFunc = formEvents.onSubmit.toString();

        // If it's using intForm.submit(), run preferred method
        if (stringFunc.includes('intForm.submit()')) {
          formEvents.onSubmit(); //intForm.onSubmit() will call validateAndSubmit()
        } else {
          // use the old method
          if (formEvents.onSubmit()) {
            // returns true or false
            validateAndSubmit();
          }
        }
      } else {
        // no custom submit function defined
        validateAndSubmit();
      }
    },
    saveDraftButtonPressed: function (
      formEvents,
      preventStateTransition,
      saveThisDraft
    ) {
      // custom onSaveDraft function is defined
      if (angular.isDefined(formEvents.onSaveDraft)) {
        var stringFunc = formEvents.onSaveDraft.toString();

        // If it's using intForm.saveDraft(), run preferred method
        if (stringFunc.includes('intForm.saveDraft()')) {
          formEvents.onSaveDraft(); //intForm.onSaveDraft() will call saveThisDraft()
        } else {
          // use the old method
          if (formEvents.onSaveDraft()) {
            // returns true or false
            saveThisDraft(preventStateTransition);
          }
        }
      } else {
        // no custom save draft function defined
        saveThisDraft(preventStateTransition);
      }
    },
    //scroll to the top most error - focus on input fields and smooth scroll on others
    scrollToError: function (formErrors, customErrors = {}) {
      //combine objects to iterate over
      const errors = Object.assign({},
        serializeFormErrors(formErrors),
        serializeCustomErrors(customErrors)
      );

      const result = Object.keys(errors).reduce((acc, id) => {

        var myError = errors[id];
        const el = document.querySelector(myError.selector);

        let visibleEl = el;

        const isVisible = (element) => {
          if (!element) return false;

          const style = window.getComputedStyle(element);
          return !!(
            element.offsetWidth > 0 &&
            element.offsetHeight > 0 &&
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            parseFloat(style.opacity) > 0
          );
        };

        // get first visible parent
        while (visibleEl && !isVisible(visibleEl)) {
          visibleEl = visibleEl.parentNode;
        }

        // Check if in viewport
        const isInViewport = (element) => {
          const rect = element.getBoundingClientRect();
          return (
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
            rect.right <= (window.innerWidth || document.documentElement.clientWidth)
          );
        };

        const rect = visibleEl ? visibleEl.getBoundingClientRect() : null;

        acc[id] = {
          el,
          visibleEl,
          inViewport: visibleEl ? isInViewport(visibleEl) : false,
          offset: visibleEl && {
            top: rect ? rect.top + window.scrollY : 0,
            left: rect ? rect.left + window.scrollX : 0
          }
        };

        return acc;
      }, {});

      const topEl = getTopElement(result);

      if (topEl.el) {

        if (topEl.inViewport) {
          topEl.visibleEl.focus();
        } else {
          const scrollEl = topEl.visibleEl?.closest('.intQuestion');
          if (scrollEl) {
            scrollEl.scrollIntoView({
              behavior: 'smooth',
              block: 'start'
            });
          }
        }
      }
    },

    //return invalid question object or undefined
    getInvalidQuestions(powerform) {
      const invalidQuestions = {};
      let isValid = true;

      forEachItem(powerform, item => {
        if (
          item.type === 'Question_Type' &&
          typeof item.validation.isValid === 'function'
        ) {
          isValid = item.validation.isValid();
          if (!isValid) {
            invalidQuestions[item.id] = clone(item);
          }
        }
      });

      return Object.keys(invalidQuestions).length > 0
        ? invalidQuestions
        : undefined; //set it to undefiend so we can set a default param and skip a check in scrollToError
    },

    /* Update Powerform (layout, js & css) *
         - Called for every change in the builder tab */
    updatePowerformLayout: function (params, success) {
      var url = baseUrl + '' + params.node.sid + '/builder';
      $http.put(url, params).then(success);
    },

    //Runs a Sworm Query
    runSwormQuery: function (question) {
      var params = { question };
      return $http
        .post(`${Settings.nodeRoot}/tasktypes/power-form/sworm-query`, params)
        .then(
          resultSet => {
            return resultSet.data;
          },
          error => {
            $log.error(error);
          }
        );
    },

    //Runs a Sworm Query
    runSwormQueryRuntime: function (params) {
      if (this.powerform && params.question.dbSettings.searchBoxQueryParams) {
        const formQuestions = this.getQuestions(this.powerform);

        params.question.dbSettings.searchBoxQueryParams.forEach(param => {
          const matchingQuestion = formQuestions.find(question => question.ClientID == param.question.ClientID);
          if (matchingQuestion) {
            param.question.Answer = matchingQuestion.Answer;
          }
        });

        params.searchBoxQueryParams = params.question.dbSettings.searchBoxQueryParams;
      }

      return $http
        .post(
          `${Settings.nodeRoot}/tasktypes/power-form/sworm-query/runtime`,
          params
        )
        .then(
          resultSet => {
            return resultSet.data;
          },
          error => {
            $log.error('Run (Sworm) Query Error: ', error.data.message, error);
          }
        );
    },

    generateFieldFormattingGuidelines: async function (formSid, mappings) {
      if (!formSid || !mappings) {
        return '';
      }

      const questionsList = await this.getQuestionsList(formSid);
      const groupedFields = { number: [], date: [], selection: {} };

      mappings.forEach(mapping => {
        const question = questionsList.find(q => q.ClientID === mapping.ClientID);

        // TODO: Check for `mapTo` to equal "field"
        if (question && question.type === 'Question_Type') {
          switch (question.QuestionType) {
            case 'Number':
              groupedFields.number.push(mapping.ColumnName);
              break;

            case 'Calendar':
              groupedFields.date.push(mapping.ColumnName);
              break;

            case 'DbSelectList':
            case 'DbRadioButton':
            case 'DbCheckbox':
              let suffix = question.multiple ? ' (multiple choices allowed)' : '';
              groupedFields.selection[mapping.ColumnName] = question.Choices.map(c => c.Value).join(',') + suffix;
              break;
          }
        }
      });

      let fieldFormatInstructions = '';
      if (groupedFields.number.length) {
        fieldFormatInstructions += `Number fields (${groupedFields.number.join(', ')}): Valid number.\n`;
      }
      if (groupedFields.date.length) {
        fieldFormatInstructions += `Date fields (${groupedFields.date.join(', ')}): Format YYYY-MM-DD.\n`;
      }
      Object.entries(groupedFields.selection).forEach(([columnName, choices]) => {
        fieldFormatInstructions += `${columnName}: ${choices}.\n`;
      });

      return fieldFormatInstructions
        ? `Ensure the following fields are returned in the format specified:\n${fieldFormatInstructions}`
        : '';
    },

    runAIProcessor: async function (model) {
      if (model.dbSettings) {
        try {

          if (!model.dbSettings.aiConnectionId) {
            throw new Error("aiConnectionId is required and cannot be null or empty.");
          }

          const formData = new FormData();
          formData.append("aiConnectionId", model.dbSettings.aiConnectionId);

          const formattedFieldDetails = await this.generateFieldFormattingGuidelines(model.formSid, model.dbSettings.mappings);

          const providerParams = {
            temperature: model.dbSettings.temperature,
            maxTokens: model.dbSettings.maxTokens,
            stop: model.dbSettings.stop ? model.dbSettings.stop.split(",") : undefined,
            userPrompt:
              model.dbSettings.prompt +
              "\nReturn the response strictly in valid JSON string, without adding any formatting or enclosing it in ```json. Include only the specified fields and do not add any extra text or explanations before or after the JSON. " + formattedFieldDetails,
            systemPrompt:
              "You are an API specialized in analyzing and extracting data from documents that only returns valid JSON responses. Do not add any explanations, text, or commentary. Respond strictly with JSON string only, without adding any formatting or enclosing it in ```json.",
          };

          formData.append("providerParams", JSON.stringify(providerParams));

          if (model.file) {
            formData.append("files", model.file);
          }

          const integrationsClient = await serviceClient.getIntegrationsClient();
          const result = await integrationsClient.apis.hidden.executeAIProcessing(
            {},
            { requestBody: formData },
            { headers: { "Content-Type": "multipart/form-data" } }
          );

          const parsedResult = JSON.parse(result.data);
          model.response = {
            data: parsedResult.data,
          };

        } catch (error) {
          const errorMessage = errorLib.getErrorMessageWithoutCode(error, null);
          console.error(errorMessage);
          $log.error(errorMessage);
          model.response = {
            error: errorMessage
          }
        }
      }
    },

    runRESTRequest: async function (
      model,
      formQuestions,
      isDesignMode
    ) {
      if (!model.dbSettings?.restRequest) {
        return;
      }

      try {
        const preparedRequest =
          await restRequest.restRequestUtils.prepareRequest(
            model.dbSettings.restRequest,
            formQuestions,
            isDesignMode
          );

        const isFormData = preparedRequest instanceof FormData;

        const integrationsClient = await serviceClient.getIntegrationsClient();

        const result =
          await integrationsClient.apis.hidden.executeRESTfulRequest(
            {},
            { requestBody: preparedRequest },
            isFormData
              ? {
                  headers: { 'Content-Type': 'multipart/form-data' },
                  transformRequest: [(data) => data],
                }
              : undefined
          );

        // console.log(
        //   "[powerForm-service] REST Request Result:",
        //   JSON.stringify(result, null, 2)
        // );

        restRequest.handleRESTResponse(model, result);
      } catch (error) {
        // console.log(
        //   "[powerForm-service] REST Request Error:",
        //   JSON.stringify(error, null, 2)
        // );

        restRequest.handleRESTError(model, error);
      }
    },

    // Get Questions List
    // Returns an array of question objects: [{}, {}, {}]
    getQuestionsList: function (formSid) {
      var url = baseUrl + 'getQuestionsList/' + formSid + '/';
      return $http.get(url).then(questionsList => {
        return questionsList.data;
      });
    },

    // Get Task References
    // Returns an array of question objects: [{}, {}, {}]
    getTaskReferences: function (formSid) {
      var url = `${Settings.nodeRoot}/workspace/form/${formSid}/process/tasks`;
      return $http.get(url).then(references => {
        return references.data;
      });
    },

    massageIntoFieldsToCapture: function (questionsList) {
      var fieldsToCapture = [];
      forEach(questionsList, function (question) {
        let fieldToCapture = {
          key: question.id,
          QuestionID: question.ClientID,
          text: question.Label,
          type: getGenericType(question.QuestionType),
          QuestionType: question.QuestionType
        };

        fieldsToCapture.push(fieldToCapture);
      });
      return fieldsToCapture;
    },

    getExportUrl: function (sid) {
      let url = `${Settings.apiRoot}/power-form/${sid}/export`;
      return url;
    },

    importForm: function (params) {
      let url = `${Settings.apiRoot}/power-form/import`;

      return $http.post(url, params).then(
        newPowerform => {
          return newPowerform.data;
        },
        error => {
          $log.error(error);
        }
      );
    },

    /* Called in formbuilder.js and object/save/save.js to start user off with section object
        When a new PowerForm is created */
    getListOfLayoutElements: function () {
      var columnObject = {
        items: []
      };
      var containerObject = {
        displayName: 'Container',
        icon: '<i class="material-icons">crop_square</i>',
        columns: [columnObject],
        readonly: false,
        open: true, // collapsed or not
        show: true, // ng-if
        type: 'Container_Type',
        id: '', // Unique, unchangeable id
        ClientID: '' // Malleable, friendly id.
      };

      var sectionObject = {
        displayName: 'Section',
        Label: 'Section',
        icon: '<i class="material-icons">crop_square</i>',
        showAsCollapsible: true,
        showSectionOutline: true,
        contents: [containerObject], //default with a default container object
        readonly: false,
        type: 'Section_Type',
        ClientID: '',
        id: '',
        class: '',
        expandOnLoad: true,
        open: true, //collapsed or not
        show: true, //ng-if

        ui: {
          backgroundColor: '#757575',
          textColor: '#000'
        }
      };

      return {
        open: true, // Palette Collapsible
        header: 'Layout', // Palette Title
        list: [
          sectionObject,
          containerObject,
          {
            displayName: 'Image',
            QuestionType: 'Image',
            Label: 'Image',
            icon: '<i class="material-icons">insert_photo</i>',
            type: 'FormTool_Type',
            flex: 100,
            ClientID: '',
            id: '',
            class: '',
            show: true,
            properties: {
              height: 100,
              width: 100,
              url: '../../../../../assets/images/logos/symbol-250.png',
              imageFile: null,
              alt: ''
            }
          },
          {
            displayName: 'Horizontal Line',
            QuestionType: 'HorizontalRule',
            icon: '<i class="material-icons">remove</i>',
            type: 'FormTool_Type'
          },
          {
            displayName: 'Form Text',
            QuestionType: 'FormText',
            formtext: '',
            icon: '<i class="material-icons">library_books</i>',
            type: 'FormTool_Type',
            show: true
          },
          {
            displayName: 'Blank Space',
            QuestionType: 'BlankSpace',
            icon: '<i class="material-icons">crop_square</i>',
            type: 'FormTool_Type'
          },
          {
            displayName: 'Button',
            Label: 'Button',
            QuestionType: 'Button',
            ClientID: '',
            class: '',
            icon: '<i class="material-icons">crop_7_5</i>',
            type: 'FormTool_Type',
            show: true,
            events: {
              onClick: null
            }
          },
          {
            displayName: 'Custom',
            QuestionType: 'CustomBlock',
            Label: 'Custom',
            icon: '<i class="material-icons">build</i>',
            type: 'FormTool_Type',
            code: '',
            ClientID: '',
            class: '',
            show: true
          }
        ] //end list
      }; //end return
    }, //end funct

    //Temporarily here until it can live in the back end or model-file
    getListOfQuestionTypes: function () {
      //Validation Defaults
      var validationObject = {
        required: false,
        requiredMessage: 'This field is required',
        min: null,
        minMessage: 'This field is too short',
        max: null,
        maxMessage: 'This field is too long',
        regEx: null,
        regExMessage: 'This field is not valid'
      };

      var eventObject = {
        onChange: null,
        onBlur: null,
        onFocus: null
      };

      return {
        formQuestions: {
          open: true,
          header: 'Questions',
          list: [
            {
              displayName: 'Short Text',
              QuestionType: 'ShortText',
              Label: 'Short Text: ',
              icon: '<i class="material-icons">short_text</i>',
              type: 'Question_Type',
              flex: 100,
              ClientID: '',
              class: '',
              show: true,
              validation: validationObject,
              events: eventObject,
              Answer: null
            },
            {
              displayName: 'Long Text',
              QuestionType: 'LongText',
              Label: 'Long Text: ',
              icon: '<i class="material-icons">message</i>',
              type: 'Question_Type',
              flex: 100,
              ClientID: '',
              class: '',
              show: true,
              validation: validationObject,
              events: eventObject,
              Answer: null
            },
            {
              displayName: 'Select List',
              QuestionType: 'DbSelectList',
              Label: 'Select: ',
              icon: '<i class="material-icons">list</i>',
              Choices: [{ Label: '', Value: '' }],
              multiple: false,
              type: 'Question_Type',
              flex: 100,
              ClientID: '',
              class: '',
              show: true,
              dbSettings: {
                useDB: false
              },
              validation: validationObject,
              events: eventObject,
              Answer: null
            },
            {
              displayName: 'Checkboxes',
              QuestionType: 'DbCheckbox',
              Label: 'Checkboxes: ',
              icon: '<i class="material-icons">check_box</i>',
              Choices: [], // OP: setting to empty as part of fix for #2011
              columnOrRow: 'row',
              type: 'Question_Type',
              flex: 100,
              ClientID: '',
              class: '',
              show: true,
              dbSettings: {
                useDB: false
              },
              validation: validationObject,
              events: eventObject,
              Answer: null
            },
            {
              displayName: 'Radio Buttons',
              QuestionType: 'DbRadioButton',
              Label: 'Radio Buttons: ',
              icon: '<i class="material-icons">radio_button_checked</i>',
              Choices: [], // OP: setting to empty as part of fix for #2011
              columnOrRow: 'row',
              type: 'Question_Type',
              flex: 100,
              ClientID: '',
              class: '',
              show: true,
              dbSettings: {
                useDB: false
              },
              validation: validationObject,
              events: eventObject,
              Answer: null
            },
            {
              displayName: 'Calendar', // Display Purposes (should not change)
              QuestionType: 'Calendar', // Tweaked for Directive Comprehension
              Label: 'Date: ', // Malleable Label, exists as a visual placeholder (this will likely change)
              icon: '<i class="material-icons">date_range</i>', // icon
              type: 'Question_Type', // So it knows which dropzone to fall into
              ClientID: '',
              class: '',
              show: true,
              events: eventObject,
              validation: {
                futureDatesOnly: false,
                required: false,
                requiredMessage: 'This field is required',
                minDate: null,
                maxDate: null,
                mdDateFilter: null // function(Date), returns true/false if allowed
              },
              Answer: null
            },
            {
              displayName: 'File Attachment',
              QuestionType: 'FileAttachment',
              Label: 'File Attachment: ',
              icon: '<i class="material-icons">attach_file</i>',
              type: 'Question_Type',
              flex: 100,
              ClientID: '',
              class: '',
              show: true,
              validation: validationObject,
              events: eventObject,
              Answer: []
            },
            {
              displayName: 'Contact Search',
              QuestionType: 'ContactSearch',
              Label: 'Contact Search: ',
              icon: '<i class="material-icons">person</i>',
              type: 'Question_Type',
              flex: 100,
              ClientID: '',
              class: '',
              show: true,
              validation: validationObject,
              events: eventObject,
              Answer: []
            },
            {
              displayName: 'Search Box',
              QuestionType: 'SearchBox',
              Label: 'Search Box: ',
              icon: '<i class="material-icons">search</i>',
              type: 'Question_Type',
              flex: 100,
              ClientID: '',
              class: '',
              show: true,
              dbSettings: {
                mappings: [],
                useDB: false
              },
              validation: validationObject,
              events: eventObject,
              Answer: null
            },
            {
              displayName: 'AI Data Extraction',
              QuestionType: 'AIBox',
              Label: 'AI Data Extraction: ',
              icon: '<i class="material-icons">memory</i>',
              type: 'Question_Type',
              flex: 100,
              ClientID: '',
              class: '',
              show: true,
              moduleDisabled: false,
              dbSettings: {
                mappings: [],
              },
              validation: validationObject,
              events: eventObject,
              Answer: null
            },
            {
              displayName: 'RESTful Element',
              QuestionType: 'RESTfulElement',
              Label: 'RESTful Element: ',
              icon: '<i class="material-icons">code</i>',
              type: 'Question_Type',
              flex: 100,
              ClientID: '',
              class: '',
              show: true,
              moduleDisabled: false,
              dbSettings: {
                mappings: [],
                useDB: false
              },
              validation: validationObject,
              events: {
                ...eventObject,
                onResponse: null,
              },
              Answer: null,
              request: {
                executeRequest: null,
              },
              response: null
            },
            {
              displayName: 'Email',
              QuestionType: 'EmailAddress',
              Label: 'Email: ',
              icon: '<i class="material-icons">email</i>',
              type: 'Question_Type',
              flex: 100,
              ClientID: '',
              class: '',
              show: true,
              validation: validationObject,
              events: eventObject,
              Answer: null
            },
            {
              displayName: 'Number',
              QuestionType: 'Number',
              Label: 'Number: ',
              icon: '<i class="material-icons">looks_one</i>',
              type: 'Question_Type',
              flex: 100,
              ClientID: '',
              class: '',
              show: true,
              validation: validationObject,
              events: eventObject,
              format: {
                digitsAfterDecimal: 2,
                currency: {
                  useCurrency: false,
                  id: ''
                }
              },
              Answer: null
            },
            {
              displayName: 'Grid',
              QuestionType: 'Grid',
              Label: 'Grid: ',
              icon: '<i class="material-icons">grid_on</i>',
              type: 'Question_Type',
              flex: 100,
              ClientID: '',
              class: '',
              show: true,
              //validation: validationObject,
              //events: eventObject,
              Answer: [],
              dontSaveDeleteColumn: false, //on dontSaveDeleteColumn removal change to true
              gridOptions: {
                enableCellEdit: true,
                enableCellEditOnFocus: false,
                enableFiltering: false,
                enableSorting: true,
                minRowsToShow: '3', // default is 10
                rowsSpecified: 0,
                maxHeight: 350, // 50px for header, 300px for 10 rows
                columnDefs: [], // array of column objects: http://bit.ly/2lWk7iC
                data: [], // [{"Column 1": "Test 1" }, {"Column 1": "Test 2" }]
                showAddRowButton: true, //shows the "Add Row" Button for the end-user
                showColumnFooter: false //used in calculations
              }
            },
            {
              displayName: 'Rich Text',
              QuestionType: 'RichText',
              Label: 'Rich Text: ',
              icon: '<i class="material-icons">library_books</i>',
              type: 'Question_Type',
              flex: 100,
              ClientID: '',
              class: '',
              show: true,
              alwaysExpanded: true,
              validation: validationObject,
              events: eventObject,
              Answer: null
            },
            {
              displayName: 'Link',
              QuestionType: 'Hyperlink',
              Label: 'Link: ',
              icon: '<i class="material-icons">link</i>',
              type: 'Question_Type',
              flex: 100,
              ClientID: '',
              class: '',
              show: true,
              validation: validationObject,
              events: eventObject,
              Answer: null
            },
            {
              displayName: 'Time Zone',
              QuestionType: 'TimeZone',
              Label: 'Time Zone: ',
              icon: '<i class="material-icons">timelapse</i>',
              type: 'Question_Type',
              flex: 100,
              ClientID: '',
              class: '',
              show: true,
              validation: validationObject,
              events: eventObject,
              Answer: null
            },
            {
              displayName: 'Signature',
              QuestionType: 'Signature',
              Label: 'Signature: ',
              icon: '<i class="material-icons">fingerprint</i>',
              type: 'Question_Type',
              flex: 100,
              ClientID: '',
              class: '',
              show: true,
              validation: validationObject,
              events: eventObject,
              Answer: null
            },
            {
              displayName: 'Password',
              QuestionType: 'Password',
              Label: 'Password: ',
              icon: '<i class="material-icons">lock_outline</i>',
              type: 'Question_Type',
              flex: 100,
              ClientID: '',
              class: '',
              show: true,
              validation: validationObject,
              events: eventObject,
              Answer: null
            }
          ]
        }
      };
    },
    resizeQuestionLabelRowByClientID: function (powerform, clientID) {
      const element = document.getElementById(clientID);
      if (element) {
        const labelContainerEl = element.querySelector(".label-container");
        const flexRowEl = element.querySelector("#flexRow");
        if (labelContainerEl) {
          const labelContainerHeight = labelContainerEl.offsetHeight;

          if (flexRowEl) {
            flexRowEl.style.height = `${labelContainerHeight}px`;
          }
        }
      }
    },
    resizeQuestionLabels: function (powerform) {
      powerform = this.powerform;
      if (!powerform) {
        return;
      }
      const questions = this.getQuestions(powerform);
      const wrapLabelQuestions = questions.filter(question => question.wrapQuestionLabel);

      wrapLabelQuestions.forEach(question => {
        this.resizeQuestionLabelRowByClientID(powerform, question.ClientID);
      });
    },
    getPrintingStyles: function (powerForm) {
      /**
       * Taken from 
       * https://www.papersizes.org/a-paper-sizes.htm
       * https://www.papersizes.org/us-paper-sizes.htm
       */
      const pageSizesPortraitMm = {
        'A0': [841, 1189],
        "A1": [594, 841],
        "A2": [420, 594],
        "A3": [297, 420],
        "A4": [210, 297],
        "A5": [148, 210],
        "A6": [105, 148],
        "A7": [74, 105],
        "A8": [52, 74],
        "Letter": [216, 279],
        "Legal": [216, 356],
      }

      function reverse(arr) {
        const result = [...arr];
        result.reverse();
        return result;
      }

      const props = [];

      if (powerForm.printPageSize) {
        if (powerForm.printPageSize === 'custom' && powerForm.printPageWidth && powerForm.printPageHeight) {
          const sizes = [powerForm.printPageWidth, powerForm.printPageHeight];
          props.push(['size', sizes.map(x => `${x}mm`).join(' ')]);
        } else {
          const orientation = powerForm.printOrientation || 'portrait';
          const sizesPortrait = pageSizesPortraitMm[powerForm.printPageSize];
          const sizes = orientation === 'portrait' ?
            sizesPortrait :
            reverse(sizesPortrait);
          props.push(['size', sizes.map(x => `${x}mm`).join(' ')]);
        }
      }

      if (powerForm.printMarginTop != null) {
        props.push(['margin-top', `${powerForm.printMarginTop}mm`]);
      }
      if (powerForm.printMarginRight != null) {
        props.push(['margin-right', `${powerForm.printMarginRight}mm`]);
      }
      if (powerForm.printMarginBottom != null) {
        props.push(['margin-bottom', `${powerForm.printMarginBottom}mm`]);
      }
      if (powerForm.printMarginLeft != null) {
        props.push(['margin-left', `${powerForm.printMarginLeft}mm`]);
      }

      if (props.length === 0) return ``;

      return `@page {${props.map(([prop, value]) => `${prop}: ${value};`).join('')}}`;
    },

    updateQuestions: function (questionsToUpdate) {
      if (!questionsToUpdate || questionsToUpdate.length == 0 || !this.powerform) return;
      const powerform = this.powerform;

      const questions = this.getQuestions(powerform);
      for (let questionToUpdate of questionsToUpdate) {

        const question = questions.find(q => q.ClientID == questionToUpdate.dataProperty);
        if (question) {
          this.updateQuestion(questionToUpdate, question);
        }
      }

    },

    updateQuestion(updatedData, question) {
      switch (question.QuestionType) {
        case 'Grid':
          this.updateGridQuestion(updatedData, question);
        case 'FileAttachment':
        case 'MultiFileAttachment':
        case 'AIBox':
          this.updateFileAttachmentQuestionTypes(updatedData, question);
          break;
        default:
          console.warn(`Question ${question.ClientID} of type ${question.QuestionType} is not supported for updating.`);
          break;
      }
    },

    updateFileAttachmentQuestionTypes(updatedData, question) {
      const savedSids = updatedData.meta2.split(',');
      const contextType = 'instancedata';
      const contextSid = updatedData.instanceDataGuid.toLowerCase();

      //Update entries in the question's Answer array with new context type and sid, update url
      question.Answer = question.Answer.map((file, index) => {
        if (savedSids.includes(file.file_key)) {
          let url = new URL(file.url, window.location.origin);

          file.context_type = contextType;
          file.context_sid = contextSid;

          url.searchParams.set('contextType', contextType);
          url.searchParams.set('contextSid', contextSid);
          file.url = `${url.pathname}${url.search}${url.hash}`;
        }

        return file;
      });
      //UI updated already
    },

    updateGridQuestion(updatedData, question) {
      const gridData = JSON.parse(updatedData.dataValue || updatedData.dataExt?.extData);

      question.Answer = question.gridOptions.data = gridData.gridCellValues;
      question.refreshGrid();
    },
  }; //end return
}
