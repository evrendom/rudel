/**
 * Classify one representative error pattern while the raw transcript is still
 * available. Raw transcripts expire after 365 days, but this compact value is
 * retained with session analytics. Callers bound `_error_sample_content` to the
 * first 20 MB so error scans have a fixed memory ceiling.
 */
export const SESSION_ERROR_PATTERN_SQL = `
    if(
      _error_count = 0,
      '',
      multiIf(
        _error_sample_content ILIKE '%OperationFailed%', 'OperationFailed',
        _error_sample_content ILIKE '%UnknownError%', 'UnknownError',
        _error_sample_content ILIKE '%ORPCError%', 'ORPCError',
        _error_sample_content ILIKE '%TimeoutError%', 'TimeoutError',
        _error_sample_content ILIKE '%TypeError%', 'TypeError',
        _error_sample_content ILIKE '%ReferenceError%', 'ReferenceError',
        _error_sample_content ILIKE '%Error:%',
          if(
            length(extractAll(_error_sample_content, '([A-Z][a-zA-Z]+Error):')) > 0,
            arrayElement(extractAll(_error_sample_content, '([A-Z][a-zA-Z]+Error):'), 1),
            'GenericError'
          ),
        _error_sample_content ILIKE '%Exception:%',
          if(
            length(extractAll(_error_sample_content, '([A-Z][a-zA-Z]+Exception):')) > 0,
            arrayElement(extractAll(_error_sample_content, '([A-Z][a-zA-Z]+Exception):'), 1),
            'Exception'
          ),
        _error_sample_content ILIKE '%error:%', 'GenericError',
        _error_sample_content ILIKE '%failed%', 'OperationFailed',
        _error_sample_content ILIKE '%timeout%', 'Timeout',
        _error_sample_content ILIKE '%not found%', 'NotFound',
        'UnknownError'
      )
    )`;
