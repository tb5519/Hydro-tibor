import _ from 'lodash';

function getInitialState() {
  const rdoc = UiContext.homeworkReview?.record;
  return rdoc?._id ? { rows: [rdoc._id], items: { [rdoc._id]: rdoc } } : { rows: [], items: {} };
}

export default function reducer(state = getInitialState(), action: any = {}) {
  if (UiContext.homeworkReview) return state;
  switch (action.type) {
    case 'SCRATCHPAD_RECORDS_LOAD_SUBMISSIONS_FULFILLED': {
      const { rdocs } = action.payload;
      return {
        ...state,
        rows: _.map(rdocs, '_id').sort((a, b) => `${b}`.localeCompare(`${a}`)),
        items: _.keyBy(rdocs, '_id'),
      };
    }
    case 'SCRATCHPAD_RECORDS_PUSH': {
      const { rdoc } = action.payload;
      const rows = [...state.rows];
      if (!rows.includes(rdoc._id)) {
        return {
          ...state,
          rows: [rdoc._id, ...state.rows].sort((a, b) => `${b}`.localeCompare(`${a}`)),
          items: {
            ...state.items,
            [rdoc._id]: rdoc,
          },
        };
      }
      return {
        ...state,
        items: {
          ...state.items,
          [rdoc._id]: rdoc,
        },
      };
    }
    default:
      return state;
  }
}
