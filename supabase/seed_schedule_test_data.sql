-- ============================================
-- 催事テストデータ (2026年4月〜6月)
-- ============================================
-- 注意: employees テーブルに既にデータが存在する前提
-- Supabase SQL Editor で実行してください

-- 催事データ
INSERT INTO events (name, venue, store_name, prefecture, start_date, end_date, status, person_in_charge, notes) VALUES
('春の北海道物産展',     '伊勢丹',   '新宿店',   '東京都',   '2026-04-08', '2026-04-19', '開催中',   '安岡一',       '初出店。試食ブースあり'),
('全国うまいもの市',     '高島屋',   '大阪店',   '大阪府',   '2026-04-15', '2026-04-26', '開催中',   '安岡弘和',     '毎年恒例。6尺2台展開'),
('初夏のスイーツフェア', '大丸',     '札幌店',   '北海道',   '2026-05-01', '2026-05-10', '手配中',   '吉田敬朗',     'じゃこ天+あげ巻セット推し'),
('九州・沖縄物産展',     '三越',     '日本橋店', '東京都',   '2026-05-07', '2026-05-18', '手配中',   '安岡一',       '5尺1台。コンパクト展開'),
('春の味覚祭',           'そごう',   '横浜店',   '神奈川県', '2026-05-14', '2026-05-24', '準備中',   '村上新一',     '横浜初出店'),
('職人の味 匠展',        '阪急',     'うめだ本店','大阪府',   '2026-05-20', '2026-06-01', '準備中',   '安岡弘和',     '6尺2台。試食多め'),
('夏の大北海道展',       '松坂屋',   '名古屋店', '愛知県',   '2026-06-03', '2026-06-15', '準備中',   '河野悟',       '名古屋エリア開拓'),
('全国グルメフェスティバル','東武',  '池袋店',   '東京都',   '2026-06-10', '2026-06-22', '準備中',   '安岡一',       '大型催事。応援要請あり'),
('四国フェア',           '伊勢丹',   '立川店',   '東京都',   '2026-04-22', '2026-05-03', '手配中',   '兵頭伸',       '地元アピール重視'),
('初夏の全国うまいもの展','丸井',    '有楽町店', '東京都',   '2026-05-25', '2026-06-07', '準備中',   '三浦重典',     '新規取引先');

-- スタッフ割り当て
-- 催事1: 春の北海道物産展（伊勢丹新宿 4/8-19）
INSERT INTO event_staff (event_id, employee_id, start_date, end_date, role) VALUES
((SELECT id FROM events WHERE name = '春の北海道物産展'), (SELECT id FROM employees WHERE name = '安岡一'),   '2026-04-08', '2026-04-19', '責任者'),
((SELECT id FROM events WHERE name = '春の北海道物産展'), (SELECT id FROM employees WHERE name = '安岡京子'), '2026-04-08', '2026-04-19', '販売'),
((SELECT id FROM events WHERE name = '春の北海道物産展'), (SELECT id FROM employees WHERE name = '松井馨'),   '2026-04-10', '2026-04-17', '応援');

-- 催事2: 全国うまいもの市（高島屋大阪 4/15-26）
INSERT INTO event_staff (event_id, employee_id, start_date, end_date, role) VALUES
((SELECT id FROM events WHERE name = '全国うまいもの市'), (SELECT id FROM employees WHERE name = '安岡弘和'), '2026-04-15', '2026-04-26', '責任者'),
((SELECT id FROM events WHERE name = '全国うまいもの市'), (SELECT id FROM employees WHERE name = '吉田敬朗'), '2026-04-15', '2026-04-26', '販売'),
((SELECT id FROM events WHERE name = '全国うまいもの市'), (SELECT id FROM employees WHERE name = '水口年光'), '2026-04-18', '2026-04-24', '応援');

-- 催事3: 初夏のスイーツフェア（大丸札幌 5/1-10）
INSERT INTO event_staff (event_id, employee_id, start_date, end_date, role) VALUES
((SELECT id FROM events WHERE name = '初夏のスイーツフェア'), (SELECT id FROM employees WHERE name = '吉田敬朗'), '2026-05-01', '2026-05-10', '責任者'),
((SELECT id FROM events WHERE name = '初夏のスイーツフェア'), (SELECT id FROM employees WHERE name = '菊池奈美'), '2026-05-01', '2026-05-10', '販売');

-- 催事4: 九州・沖縄物産展（三越日本橋 5/7-18）
INSERT INTO event_staff (event_id, employee_id, start_date, end_date, role) VALUES
((SELECT id FROM events WHERE name = '九州・沖縄物産展'), (SELECT id FROM employees WHERE name = '安岡一'),   '2026-05-07', '2026-05-18', '責任者'),
((SELECT id FROM events WHERE name = '九州・沖縄物産展'), (SELECT id FROM employees WHERE name = '河野悟'),   '2026-05-07', '2026-05-18', '販売'),
((SELECT id FROM events WHERE name = '九州・沖縄物産展'), (SELECT id FROM employees WHERE name = '畠山剛士'), '2026-05-10', '2026-05-16', '応援');

-- 催事5: 春の味覚祭（そごう横浜 5/14-24）
INSERT INTO event_staff (event_id, employee_id, start_date, end_date, role) VALUES
((SELECT id FROM events WHERE name = '春の味覚祭'), (SELECT id FROM employees WHERE name = '村上新一'), '2026-05-14', '2026-05-24', '責任者'),
((SELECT id FROM events WHERE name = '春の味覚祭'), (SELECT id FROM employees WHERE name = '安岡京子'), '2026-05-14', '2026-05-24', '販売'),
((SELECT id FROM events WHERE name = '春の味覚祭'), (SELECT id FROM employees WHERE name = '兵頭伸'),   '2026-05-16', '2026-05-22', '応援');

-- 催事6: 職人の味 匠展（阪急うめだ 5/20-6/1）
INSERT INTO event_staff (event_id, employee_id, start_date, end_date, role) VALUES
((SELECT id FROM events WHERE name = '職人の味 匠展'), (SELECT id FROM employees WHERE name = '安岡弘和'), '2026-05-20', '2026-06-01', '責任者'),
((SELECT id FROM events WHERE name = '職人の味 匠展'), (SELECT id FROM employees WHERE name = '三浦重典'), '2026-05-20', '2026-06-01', '販売'),
((SELECT id FROM events WHERE name = '職人の味 匠展'), (SELECT id FROM employees WHERE name = '松井馨'),   '2026-05-22', '2026-05-30', '応援');

-- 催事7: 夏の大北海道展（松坂屋名古屋 6/3-15）
INSERT INTO event_staff (event_id, employee_id, start_date, end_date, role) VALUES
((SELECT id FROM events WHERE name = '夏の大北海道展'), (SELECT id FROM employees WHERE name = '河野悟'),   '2026-06-03', '2026-06-15', '責任者'),
((SELECT id FROM events WHERE name = '夏の大北海道展'), (SELECT id FROM employees WHERE name = '水口年光'), '2026-06-03', '2026-06-15', '販売'),
((SELECT id FROM events WHERE name = '夏の大北海道展'), (SELECT id FROM employees WHERE name = '吉田敬朗'), '2026-06-05', '2026-06-13', '応援');

-- 催事8: 全国グルメフェスティバル（東武池袋 6/10-22）
INSERT INTO event_staff (event_id, employee_id, start_date, end_date, role) VALUES
((SELECT id FROM events WHERE name = '全国グルメフェスティバル'), (SELECT id FROM employees WHERE name = '安岡一'),   '2026-06-10', '2026-06-22', '責任者'),
((SELECT id FROM events WHERE name = '全国グルメフェスティバル'), (SELECT id FROM employees WHERE name = '安岡京子'), '2026-06-10', '2026-06-22', '販売'),
((SELECT id FROM events WHERE name = '全国グルメフェスティバル'), (SELECT id FROM employees WHERE name = '畠山剛士'), '2026-06-12', '2026-06-20', '応援'),
((SELECT id FROM events WHERE name = '全国グルメフェスティバル'), (SELECT id FROM employees WHERE name = '兵頭伸'),   '2026-06-14', '2026-06-22', '応援');

-- 催事9: 四国フェア（伊勢丹立川 4/22-5/3）
INSERT INTO event_staff (event_id, employee_id, start_date, end_date, role) VALUES
((SELECT id FROM events WHERE name = '四国フェア'), (SELECT id FROM employees WHERE name = '兵頭伸'),   '2026-04-22', '2026-05-03', '責任者'),
((SELECT id FROM events WHERE name = '四国フェア'), (SELECT id FROM employees WHERE name = '村上新一'), '2026-04-22', '2026-05-03', '販売'),
((SELECT id FROM events WHERE name = '四国フェア'), (SELECT id FROM employees WHERE name = '畠山剛士'), '2026-04-24', '2026-04-30', '応援');

-- 催事10: 初夏の全国うまいもの展（丸井有楽町 5/25-6/7）
INSERT INTO event_staff (event_id, employee_id, start_date, end_date, role) VALUES
((SELECT id FROM events WHERE name = '初夏の全国うまいもの展'), (SELECT id FROM employees WHERE name = '三浦重典'), '2026-05-25', '2026-06-07', '責任者'),
((SELECT id FROM events WHERE name = '初夏の全国うまいもの展'), (SELECT id FROM employees WHERE name = '菊池奈美'), '2026-05-25', '2026-06-07', '販売'),
((SELECT id FROM events WHERE name = '初夏の全国うまいもの展'), (SELECT id FROM employees WHERE name = '安岡弘和'), '2026-05-27', '2026-06-05', '応援');
