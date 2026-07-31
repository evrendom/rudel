/**
 * Classify one representative error pattern while the raw transcript is still
 * available. Raw transcripts expire after 365 days, but this compact value is
 * retained with session analytics.
 */
export const SESSION_ERROR_PATTERN_SQL = `
    if(
      _error_count = 0,
      '',
      multiIf(
        cs.content ILIKE '%OperationFailed%', 'OperationFailed',
        cs.content ILIKE '%UnknownError%', 'UnknownError',
        cs.content ILIKE '%ORPCError%', 'ORPCError',
        cs.content ILIKE '%TimeoutError%', 'TimeoutError',
        cs.content ILIKE '%TypeError%', 'TypeError',
        cs.content ILIKE '%ReferenceError%', 'ReferenceError',
        cs.content ILIKE '%Error:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):'), 1),
            'GenericError'
          ),
        cs.content ILIKE '%Exception:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):'), 1),
            'Exception'
          ),
        cs.content ILIKE '%error:%', 'GenericError',
        cs.content ILIKE '%failed%', 'OperationFailed',
        cs.content ILIKE '%timeout%', 'Timeout',
        cs.content ILIKE '%not found%', 'NotFound',
        'UnknownError'
      )
    )`;
