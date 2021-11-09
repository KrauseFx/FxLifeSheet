CREATE VIEW all_matched_days AS  SELECT raw_data.matcheddate,
    count(*) AS count
   FROM raw_data
  WHERE raw_data.matcheddate IS NOT NULL
  GROUP BY raw_data.matcheddate
  ORDER BY raw_data.matcheddate DESC;
