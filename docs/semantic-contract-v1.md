# DTP Analytics — Phase 1A: Semantic / Normalization Contract v1 (final review)

> Контракт между ~3.67 ГБ raw и продуктом. Детерминированный, рецензируемый, версионированный.
> SEMANTIC_CONTRACT_VERSION = 1 · docs/semantic-contract-v1.json · docs/semantic-raw-inventory.json
> Принцип: лучше UNKNOWN, чем ошибочная нормализация. LLM — только кандидат; финал — ручной.
> Методология: ДВА знаменателя. Три причины отсутствия semantic value разделены: source_missing / unknown / ambiguous.

---
## 1. Итоговая compact validation table

| Контракт | source_total | source_missing | mapped (present%) | mapped (ALL%) | unknown | other | ambiguous | sentinel |
|---|---|---|---|---|---|---|---|---|
| vehicle_supercategory | 2 653 755 | 13 253 (0.499%) | 99.996% | **99.497%** | 102 | — | — | — |
| human_outcome | 4 079 768 | 0 | 97.396% | **97.396%** | 106 224 | — | — | — |
| participant_type | 4 079 768 | 0 | 97.714% | **97.714%** | 0 | 4 710 | 0 | 88 564 |
| region_subject | 85 | 0 | 100% | 100% | 0 | 0 | 0 | 0 |
| local_region | 1 616 059 | 0 | 100% | 100% | — | — | — | — | (composite 2414, same-name 87) |
| crash_scheme | 1 616 059 | 0 | — | — | 0 | — | — | — | (unresolved 1 526 840 / upstream_excluded 89 219) |
| brand | 2 653 755 | 166 632 (6.279%) | 94.822% | **88.868%** | — | — | — | — | (aggregate 128 786) |

---
## 2. Подробный coverage

### 2.1 vehicle_supercategory
Всего ТС: **2 653 755** · category missing: **13 253** (0.499%)
- заполненных: **99.996%** · всех: **99.497%** · unknown: 102

- supercategory - ТС - доля от всех

### 2.2 human_outcome
Всего: **4 079 768** · mapped (present) **97.396%** · unknown 106 224

- группа - участников - доля

### 2.3 participant_type
Всего: **4 079 768** · mapped **97.714%** · other 4 710 · ambiguous **0** · sentinel 88 564

- тип - участников

### 2.4 infrastructure (facets[])
Всего элементов: **3 899 305** · mapped (present) **100.0%**

### 2.1 vehicle_supercategory (список)

| supercategory | ТС | доля |
|---|---|---|
| passenger_car | 1 961 280 | 73.91% |
| truck | 236 045 | 8.89% |
| motorcycle | 136 168 | 5.13% |
| bus | 116 184 | 4.38% |
| trailer | 61 706 | 2.33% |
| bicycle | 59 046 | 2.22% |
| special_vehicle | 37 648 | 1.42% |
| other | 22 144 | 0.83% |
| rail_vehicle | 6 449 | 0.24% |
| personal_mobility | 3 730 | 0.14% |

### 2.2 human_outcome (список)

| группа | участников | доля |
|---|---|---|
| not_injured | 1 663 438 | 40.77% |
| outpatient | 1 238 607 | 30.36% |
| hospitalized | 805 219 | 19.74% |
| fatal_on_scene | 121 972 | 2.99% |
| minor_injury | 86 751 | 2.13% |
| fatal_afterwards | 50 019 | 1.23% |
| fatal_transport | 7 538 | 0.18% |

> **minor_injury** — отдельная группа (источник: «к категории раненый не относится»). НЕ смешано с outpatient.

### 2.3 participant_type (список)

| тип | участников |
|---|---|
| driver | 2 505 963 |
| passenger | 928 475 |
| pedestrian | 493 124 |
| source_sentinel_no_participant | 88 564 |
| cyclist | 56 183 |
| other | 4 710 |
| road_worker | 1 782 |
| traffic_police | 717 |
| public_safety_worker | 250 |

> **traffic_police** (только ДПС/ГИБДД) и **public_safety_worker** (полиция/Росгвардия/Минобороны/ФСБ/МЧС) разделены. «Пешеход из ТС» → pedestrian (8223), НЕ ambiguous.

### 2.4 infrastructure facets

| facet | элементов |
|---|---|
| road_context | 1 065 891 |
| none | 982 622 |
| intersection | 712 181 |
| poi_other | 325 273 |
| residential | 257 591 |
| pedestrian_crossing | 246 969 |
| public_transport | 125 083 |
| roadside_service | 63 890 |
| education_children | 52 151 |
| bridge_tunnel | 36 991 |
| parking | 16 013 |
| pedestrian_area | 14 003 |
| railway | 2 210 |
| education_general | 1 419 |
| transport_hub | 6 |

> Пешеходная зона/Тротуар → **pedestrian_area** (НЕ crossing). Generic education → **education_general**. Transport hub → **transport_hub**. Выезд/перегон скота → **road_context**. Составные: школьный переход → facets [pedestrian_crossing, education_children].

### 2.5 region_subject + local_region

region_subject: **85/85**. local_region: present **1 616 059**, composite **2414**, same-name-across-subjects **87**.

**Правила `local_region` (minimal canonical layer, БЕЗ fuzzy/geocoding/справочников):**

- **Источник:** `properties.region` — район/город (2282 RAW значения), заполнено 100%.
- **Normalization:** `strip()` → collapse multiple whitespace (`" ".join(s.split())`) → `lower()` для ключа. Оригинальная строка сохраняется как `canonical display` (без переписывания).
- **Composite key:** `(region_subject_id, normalized_local_region)`. Один и тот же local_region в разных субъектах — **разные** ключи, не смешиваются (проверено: 87 имен встречаются в >1 субъекте, ключ это разводит).
- **НЕ делается на этом этапе:** геокодирование, объединение районов по внешним справочникам, fuzzy merge, административные реформы, привязка к ОКТМО/ОКАТО. Семантика сохраняется максимально близко к источнику.
- Функция доступа: `semantic.contract.local_region_norm(raw)` + `semantic.contract.local_region_key(subject_id, raw)` (определены в Phase 1B при интеграции).



### 2.6 crash_scheme

Общее **1 616 059** · unresolved **1 526 840** · upstream_excluded **89 219**

Provenance:
```
repo: https://github.com/dtpstat/dtp-stat
path: data/gibdd/process.py · branch: master · commit: 129224c0fdc4600b89983f96f87fa69a8294ae9e
date: 2026-08-27T00:00:00Z
правило: if item['infoDtp']['s_dtp'] not in ["290","390","490","590","690","790","890","990"] else None
исключённые: 290, 390, 490, 590, 690, 790, 890, 990
```

> 8 кодов upstream превращает в None. Причина не задокументирована → status=no_scheme/upstream_excluded, reason unknown. Остальные 60 — unresolved (без угаданных имён).

### 2.7 brand

Всего ТС: **2 653 755** · brand missing: **166 632** (6.279%)
от заполненных: pass-through **94.822%**, aggregate **5.178%**
от ВСЕХ ТС: pass-through **88.868%**, aggregate **4.853%**, source_missing **6.279%**

---
## 3. Полные mapping tables

### 3.1 vehicle_supercategory (118 RAW)

| RAW category | → supercategory |
|---|---|
| `В-класс (малый) до 3,9 м` | `passenger_car` |
| `С-класс (малый средний, компактный) до 4,3 м` | `passenger_car` |
| `D-класс (средний) до 4,6 м` | `passenger_car` |
| `А-класс (особо малый) до 3,5 м` | `passenger_car` |
| `Е-класс (высший средний, бизнес-класс) до 4,9 м` | `passenger_car` |
| `S-класс (высший, представительский класс) более 4,9 м` | `passenger_car` |
| `Минивэны и универсалы повышенной вместимости` | `passenger_car` |
| `Легковые автомобили (без типа)` | `passenger_car` |
| `Прочие легковые автомобили` | `passenger_car` |
| `Седельные тягачи` | `truck` |
| `Бортовые грузовые автомобили` | `truck` |
| `Бортовые` | `truck` |
| `Самосвалы` | `truck` |
| `Фургоны` | `truck` |
| `Цистерны` | `truck` |
| `Рефрижераторы` | `truck` |
| `Прочие грузовые автомобили` | `truck` |
| `Грузовые автомобили (без типа)` | `truck` |
| `Тягачи` | `truck` |
| `Автоэвакуаторы` | `truck` |
| `Автолесовозы` | `truck` |
| `Автоцементовозы` | `truck` |
| `Карьерные самосвалы` | `truck` |
| `Автобетоносмесители` | `truck` |
| `Автобетононасосы` | `truck` |
| `Шасси` | `truck` |
| `Транспортные средства для перевозки нефтепродуктов` | `truck` |
| `Транспортные средства для перевозки сжиженных углеводородных газов на давление до 1,8 Мпа` | `truck` |
| `Транспортные средства для перевозки пищевых жидкостей` | `truck` |
| `Транспортные средства для перевозки длинномерных грузов` | `truck` |
| `Одноэтажные длиной от 5 до 8 м` | `bus` |
| `Одноэтажные длиной от 8 до 12 м` | `bus` |
| `Одноэтажные длиной не более 5 м` | `bus` |
| `Одноэтажные, сочлененные длиной более 12 м` | `bus` |
| `Прочие одноярусные` | `bus` |
| `Прочие одноэтажные` | `bus` |
| `Двухярусные` | `bus` |
| `Двухэтажные` | `bus` |
| `Автобусы (без типа)` | `bus` |
| `Электробусы` | `bus` |
| `Школьные автобусы` | `bus` |
| `Автобусы для перевозки детей, соответствующие ГОСТ 33552-2015 и (или) п.1.16 прил. 6 ТР ТС 018/2011` | `bus` |
| `Троллейбусы` | `bus` |
| `Трамваи` | `rail_vehicle` |
| `Мотоциклы` | `motorcycle` |
| `Мопеды с двигателем внутреннего сгорания менее 50 см. куб.` | `motorcycle` |
| `Мопеды с двигателем внутреннего сгорания более 50 см. куб.` | `motorcycle` |
| `Мопеды с электродвигателем менее 4 кВт` | `motorcycle` |
| `Мотороллеры` | `motorcycle` |
| `Квадроциклы` | `motorcycle` |
| `Квадрициклы` | `motorcycle` |
| `Трициклы` | `motorcycle` |
| `Мотовелосипеды` | `motorcycle` |
| `Мотоколяски` | `motorcycle` |
| `Снегоходы` | `motorcycle` |
| `Мотонарты, аэросани` | `motorcycle` |
| `Иные мототранспортные средства` | `motorcycle` |
| `Мототранспорт (без типа)` | `motorcycle` |
| `Велосипеды` | `bicycle` |
| `Велосипеды (без двигателя)` | `bicycle` |
| `Велосипед с электрическим двигателем` | `bicycle` |
| `Велосипед с двигателем внутреннего сгорания` | `bicycle` |
| `Персональное электрическое средство передвижения малой мощности` | `personal_mobility` |
| `Персональное электрическое средство передвижения малой мощности (не применяется)` | `personal_mobility` |
| `Иные СИМ` | `personal_mobility` |
| `Электросамокаты` | `personal_mobility` |
| `Моноколеса` | `personal_mobility` |
| `Тракторы` | `special_vehicle` |
| `Самоходные мотоблоки` | `special_vehicle` |
| `Самоходные машины и механизмы сельскохозяйственного назначения` | `special_vehicle` |
| `Прочие самоходные машины и механизмы` | `special_vehicle` |
| `Экскаваторы` | `special_vehicle` |
| `Автогрейдеры` | `special_vehicle` |
| `Фронтальные погрузчики` | `special_vehicle` |
| `Бульдозеры` | `special_vehicle` |
| `Автокраны и транспортные средства, оснащенные кранами-манипуляторами` | `special_vehicle` |
| `Транспортные средства, оснащенные подъемниками с рабочими платформами` | `special_vehicle` |
| `Автогудронаторы` | `special_vehicle` |
| `Иные дорожно-строительные и дорожно-эксплуатационные машины и механизмы` | `special_vehicle` |
| `Специализированная снегоуборочная техника` | `special_vehicle` |
| `Прочая спецтехника` | `special_vehicle` |
| `Спецтехника (без типа)` | `special_vehicle` |
| `Транспортные средства для обслуживания нефтяных и  газовых скважин` | `special_vehicle` |
| `Пожарные автомобили` | `special_vehicle` |
| `Автомобили скорой медицинской помощи` | `special_vehicle` |
| `Медицинские комплексы на шасси транспортных средств` | `special_vehicle` |
| `Оснащённые специализированным оборудованием  автотранспортные средства для коммунального хозяйства и  содержания дорог` | `special_vehicle` |
| `Оснащённые специализированным оборудованием автотранспортные средства аварийно-спасательных служб и полиции` | `special_vehicle` |
| `Специализированная техника военного назначения` | `special_vehicle` |
| `Специализированная техника МВД` | `special_vehicle` |
| `Специализированная техника аварийно-спасательного назначения` | `special_vehicle` |
| `Боевая техника` | `special_vehicle` |
| `Транспортные средства оперативно-служебные для перевозки лиц, находящихся под стражей` | `special_vehicle` |
| `Транспортные средства для перевозки денежной выручки и ценных грузов` | `special_vehicle` |
| `Полуприцепы прочие` | `trailer` |
| `Полуприцепы с бортовой платформой` | `trailer` |
| `Полуприцепы-фургоны` | `trailer` |
| `Полуприцепы-цистерны` | `trailer` |
| `Полуприцепы-самосвалы` | `trailer` |
| `Прицепы прочие` | `trailer` |
| `Прицепы к легковым автомобилям` | `trailer` |
| `Прицепы общего назначения к грузовым автомобилям` | `trailer` |
| `Прицепы-самосвалы` | `trailer` |
| `Прицепы-цистерны` | `trailer` |
| `Прицепы тракторные` | `trailer` |
| `Прицепы со специализированными кузовами` | `trailer` |
| `Прицепы-трейлеры` | `trailer` |
| `Прицепы вагоны-дома передвижные` | `trailer` |
| `Автодома` | `special_vehicle` |
| `Гужевой транспорт` | `other` |
| `Подвижной состав ж/д` | `rail_vehicle` |
| `Транспортные средства для перевозки детей` | `bus` |
| `Прочие` | `other` |
| `Иные ТС` | `other` |
| `Не установлено` | `unknown` |
| `Не установлено (без типа)` | `unknown` |
| `Прочие Типы ТС (без типа)` | `other` |
| `Спортивные (гоночные)` | `special_vehicle` |

### 3.2 human_outcome (42 RAW)

| RAW health_status | → detail | → group |
|---|---|---|
| `Не пострадал` | `not_injured` | `not_injured` |
| `Раненый, находящийся (находившийся) на стационарном лечении` | `hospitalized` | `hospitalized` |
| `Получил телесные повреждения с показанием к лечению в медицинских организациях (кроме разовой медицинской помощи)` | `hospitalized` | `hospitalized` |
| `Раненый, находящийся (находившийся)  на амбулаторном лечении, либо которому по характеру полученных травм обозначена необходимость амбулаторного лечения (вне зависимости от его фактического прохождения)` | `outpatient` | `outpatient` |
| `Раненый, находящийся (находившийся) на амбулаторном лечении, либо в условиях дневного стационара` | `outpatient` | `outpatient` |
| `Получил травмы с оказанием разовой медицинской помощи, к категории раненый не относится` | `minor_injury` | `minor_injury` |
| `Получил телесные повреждения с показанием к лечению в медицинских организациях, фактически лечение не проходил, к категории раненый не относится` | `minor_injury` | `minor_injury` |
| `Скончался на месте ДТП до приезда скорой медицинской помощи` | `fatal_on_scene` | `fatal_on_scene` |
| `Скончался на месте ДТП по прибытию скорой медицинской помощи, но до транспортировки в мед. организацию` | `fatal_on_scene` | `fatal_on_scene` |
| `Скончался на месте ДТП по прибытию скорой медицинской помощи, но до транспортировки в медицинское учреждение` | `fatal_on_scene` | `fatal_on_scene` |
| `Скончался при транспортировке` | `fatal_transport` | `fatal_transport` |
| `Скончался в течение 1 суток` | `fatal_afterwards_day1` | `fatal_afterwards` |
| `Скончался в течение 2 суток` | `fatal_afterwards_day2` | `fatal_afterwards` |
| `Скончался в течение 3 суток` | `fatal_afterwards_day3` | `fatal_afterwards` |
| `Скончался в течение 4 суток` | `fatal_afterwards_day4` | `fatal_afterwards` |
| `Скончался в течение 5 суток` | `fatal_afterwards_day5` | `fatal_afterwards` |
| `Скончался в течение 6 суток` | `fatal_afterwards_day6` | `fatal_afterwards` |
| `Скончался в течение 7 суток` | `fatal_afterwards_day7` | `fatal_afterwards` |
| `Скончался в течение 8 суток` | `fatal_afterwards_day8` | `fatal_afterwards` |
| `Скончался в течение 9 суток` | `fatal_afterwards_day9` | `fatal_afterwards` |
| `Скончался в течение 10 суток` | `fatal_afterwards_day10` | `fatal_afterwards` |
| `Скончался в течение 11 суток` | `fatal_afterwards_day11` | `fatal_afterwards` |
| `Скончался в течение 12 суток` | `fatal_afterwards_day12` | `fatal_afterwards` |
| `Скончался в течение 13 суток` | `fatal_afterwards_day13` | `fatal_afterwards` |
| `Скончался в течение 14 суток` | `fatal_afterwards_day14` | `fatal_afterwards` |
| `Скончался в течение 15 суток` | `fatal_afterwards_day15` | `fatal_afterwards` |
| `Скончался в течение 16 суток` | `fatal_afterwards_day16` | `fatal_afterwards` |
| `Скончался в течение 17 суток` | `fatal_afterwards_day17` | `fatal_afterwards` |
| `Скончался в течение 18 суток` | `fatal_afterwards_day18` | `fatal_afterwards` |
| `Скончался в течение 19 суток` | `fatal_afterwards_day19` | `fatal_afterwards` |
| `Скончался в течение 20 суток` | `fatal_afterwards_day20` | `fatal_afterwards` |
| `Скончался в течение 21 суток` | `fatal_afterwards_day21` | `fatal_afterwards` |
| `Скончался в течение 22 суток` | `fatal_afterwards_day22` | `fatal_afterwards` |
| `Скончался в течение 23 суток` | `fatal_afterwards_day23` | `fatal_afterwards` |
| `Скончался в течение 24 суток` | `fatal_afterwards_day24` | `fatal_afterwards` |
| `Скончался в течение 25 суток` | `fatal_afterwards_day25` | `fatal_afterwards` |
| `Скончался в течение 26 суток` | `fatal_afterwards_day26` | `fatal_afterwards` |
| `Скончался в течение 27 суток` | `fatal_afterwards_day27` | `fatal_afterwards` |
| `Скончался в течение 28 суток` | `fatal_afterwards_day28` | `fatal_afterwards` |
| `Скончался в течение 29 суток` | `fatal_afterwards_day29` | `fatal_afterwards` |
| `Скончался в течение 30 суток` | `fatal_afterwards_day30` | `fatal_afterwards` |
| `Не определен` | `unknown` | `unknown` |

### 3.3 infrastructure (59 RAW, facets[])

| RAW nearby | → detail | → group | → facets |
|---|---|---|---|
| `Отсутствие в непосредственной близости объектов УДС и объектов притяжения` | `no_objects` | `none` | none |
| `Перегон (нет объектов на месте ДТП)` | `road_segment` | `road_context` | road_context |
| `Нерегулируемый перекрёсток` | `intersection_uncontrolled` | `intersection` | intersection |
| `Нерегулируемый перекрёсток неравнозначных улиц (дорог)` | `intersection_uncontrolled` | `intersection` | intersection |
| `Нерегулируемый перекрёсток равнозначных улиц (дорог)` | `intersection_uncontrolled` | `intersection` | intersection |
| `Регулируемый перекрёсток` | `intersection_controlled` | `intersection` | intersection |
| `Регулируемый перекресток` | `intersection_controlled` | `intersection` | intersection |
| `Нерегулируемое пересечение с круговым движением` | `intersection_roundabout` | `intersection` | intersection |
| `Нерегулируемый пешеходный переход` | `pedestrian_crossing_uncontrolled` | `pedestrian_crossing` | pedestrian_crossing |
| `Регулируемый пешеходный переход` | `pedestrian_crossing_controlled` | `pedestrian_crossing` | pedestrian_crossing |
| `Подземный пешеходный переход` | `pedestrian_crossing_underground` | `pedestrian_crossing` | pedestrian_crossing |
| `Пешеходная зона` | `pedestrian_zone` | `pedestrian_area` | pedestrian_area |
| `Тротуар, пешеходная дорожка` | `pavement` | `pedestrian_area` | pedestrian_area |
| `Нерегулируемый пешеходный переход, расположенный на участке улицы или дороги, проходящей вдоль территории школы или иной детской организации` | `pedestrian_crossing_uncontrolled_school` | `pedestrian_crossing` | pedestrian_crossing, education_children |
| `Регулируемый пешеходный переход, расположенный на участке улицы или дороги, проходящей вдоль территории школы или иной детской организации` | `pedestrian_crossing_controlled_school` | `pedestrian_crossing` | pedestrian_crossing, education_children |
| `Нерегулируемый пешеходный переход, расположенный на участке улицы или дороги, проходящей вдоль территории школы или иного детского учреждения` | `pedestrian_crossing_uncontrolled_school` | `pedestrian_crossing` | pedestrian_crossing, education_children |
| `Регулируемый пешеходный переход, расположенный на участке улицы или дороги, проходящей вдоль территории школы или иного детского учреждения` | `pedestrian_crossing_controlled_school` | `pedestrian_crossing` | pedestrian_crossing, education_children |
| `Остановка общественного транспорта` | `public_transport_stop` | `public_transport` | public_transport |
| `Остановка трамвая` | `public_transport_tram_stop` | `public_transport` | public_transport |
| `Остановка маршрутного такси` | `public_transport_marshrutka` | `public_transport` | public_transport |
| `Регулируемый ж/д переезд без дежурного` | `railway_crossing_controlled_noguard` | `railway` | railway |
| `Регулируемый ж/д переезд с дежурным` | `railway_crossing_controlled_guard` | `railway` | railway |
| `Нерегулируемый ж/д переезд` | `railway_crossing_uncontrolled` | `railway` | railway |
| `Мост, эстакада, путепровод` | `bridge` | `bridge_tunnel` | bridge_tunnel |
| `Мост` | `bridge` | `bridge_tunnel` | bridge_tunnel |
| `Подход к мосту, эстакаде, путепроводу` | `bridge_approach` | `bridge_tunnel` | bridge_tunnel |
| `Эстакада, путепровод` | `viaduct` | `bridge_tunnel` | bridge_tunnel |
| `Тоннель` | `tunnel` | `bridge_tunnel` | bridge_tunnel |
| `АЗС` | `gas_station` | `roadside_service` | roadside_service |
| `Объект торговли, общественного питания на автодороге вне НП` | `roadside_service_point` | `roadside_service` | roadside_service |
| `Одиночный торговый объект, являющийся местом притяжения транспорта и (или) пешеходов` | `roadside_service_point` | `roadside_service` | roadside_service |
| `Крупный торговый объект (являющийся объектом массового тяготения пешеходов и (или) транспорта)` | `roadside_service_point` | `roadside_service` | roadside_service |
| `Автостоянка (отделенная от проезжей части)` | `parking_separated` | `parking` | parking |
| `Автостоянка (не отделённая от проезжей части)` | `parking_integrated` | `parking` | parking |
| `Зоны отдыха` | `rest_area` | `roadside_service` | roadside_service |
| `Аэропорт, ж/д вокзал (ж/д станция), речной или морской порт (пристань)` | `transport_hub` | `transport_hub` | transport_hub |
| `Школа либо иная детская (в т.ч. дошкольная) организация` | `school_children` | `education_children` | education_children |
| `Школа либо иное детское (в т.ч. дошкольное) учреждение` | `school_children` | `education_children` | education_children |
| `Иное образовательное учреждение` | `education_other` | `education_general` | education_general |
| `Иная образовательная организация` | `education_other` | `education_general` | education_general |
| `Жилые дома индивидуальной застройки` | `residential_individual` | `residential` | residential |
| `Многоквартирные жилые дома` | `residential_apartments` | `residential` | residential |
| `Внутридворовая территория` | `residential_yard` | `residential` | residential |
| `Гаражные постройки (гаражный кооператив, товарищество либо иное место концентрированного размещения гаражей)` | `residential_garages` | `residential` | residential |
| `Административные здания` | `administrative_building` | `poi_other` | poi_other |
| `Объект (здание, сооружение) религиозного культа` | `religious_building` | `poi_other` | poi_other |
| `Спортивные и развлекательные объекты` | `sport_entertainment` | `poi_other` | poi_other |
| `Объект строительства` | `construction` | `poi_other` | poi_other |
| `Производственное предприятие` | `industrial` | `poi_other` | poi_other |
| `Медицинские (лечебные) организации` | `medical` | `poi_other` | poi_other |
| `Лечебные учреждения` | `medical` | `poi_other` | poi_other |
| `Иной объект` | `other_object` | `poi_other` | poi_other |
| `Иное место` | `other_place` | `poi_other` | poi_other |
| `СП ДПС (КПМ)` | `police_post` | `poi_other` | poi_other |
| `Выезд с прилегающей территории` | `adjacent_exit` | `road_context` | road_context |
| `Место для перегона скота` | `livestock_crossing` | `road_context` | road_context |
| `Ледовая переправа(официально открытая и оборудованная)` | `ice_crossing` | `road_context` | road_context |
| `Ледовая переправа` | `ice_crossing` | `road_context` | road_context |
| `Стихийно возникшая (не предусмотренная) ледовая переправа` | `ice_crossing_unofficial` | `road_context` | road_context |

### 3.4 participant_type (16 RAW)

| RAW role | → type | status | detail |
|---|---|---|---|
| `Водитель` | `driver` | `mapped` |  |
| `Пассажир` | `passenger` | `mapped` |  |
| `Пешеход` | `pedestrian` | `mapped` |  |
| `Велосипедист` | `cyclist` | `mapped` |  |
| `Велосипедист (не применяется)` | `cyclist` | `mapped` |  |
| `Работник дорожной организации, осуществляющий работы на проезжей части (обочине и т.д.)` | `road_worker` | `mapped` |  |
| `Работник иных организаций (коммунальных служб, электросетей, водоканала и т.д.), осуществляющий работы на проезжей части (обочине и т.д.)` | `road_worker` | `mapped` |  |
| `Сотрудник ДПС (ГИБДД), выполняющий служебные обязанности на проезжей части (обочине и т.д.)` | `traffic_police` | `mapped` |  |
| `Сотрудник полиции (кроме ГИБДД), сотрудник (военнослужащий) Росгвардии, Минобороны, ФСБ, ФСО, МЧС и т.д., выполняющий служебные обязанности на проезжей части (обочине и т.д.)` | `public_safety_worker` | `mapped` |  |
| `Пешеход, перед ДТП находившийся в (на) ТС в качестве водителя или пешеход, перед ДТП находившийся в (на) ТС в качестве пассажира` | `pedestrian` | `mapped` | pedestrian_from_vehicle |
| `Иной участник` | `other` | `other` |  |
| `Погонщик скота` | `other` | `other` |  |
| `Всадник` | `other` | `other` |  |
| `Лицо, осуществляющее торговлю (иную деятельность) на проезжей части (обочине и т.д.)` | `other` | `other` |  |
| `Лицо, осуществляющее умышленное перекрытие проезжей части` | `other` | `other` |  |
| `без участника` | `source_sentinel_no_participant` | `sentinel` |  |

### 3.5 region_subject (85)

| slug | canonical_name |
|---|---|
| `altaiskii-krai` | Алтайский край |
| `amurskaia-oblast` | Амурская область |
| `arkhangelskaia-oblast` | Архангельская область |
| `astrakhanskaia-oblast` | Астраханская область |
| `belgorodskaia-oblast` | Белгородская область |
| `brianskaia-oblast` | Брянская область |
| `chechenskaia-respublika` | Чеченская Республика |
| `cheliabinskaia-oblast` | Челябинская область |
| `chukotskii-avtonomnyi-okrug` | Чукотский автономный округ |
| `chuvashskaia-respublika-chuvashiia` | Чувашская Республика |
| `evreiskaia-avtonomnaia-oblast` | Еврейская автономная область |
| `iamalo-nenetskii-avtonomnyi-okrug` | Ямало-Ненецкий автономный округ |
| `iaroslavskaia-oblast` | Ярославская область |
| `irkutskaia-oblast` | Иркутская область |
| `ivanovskaia-oblast` | Ивановская область |
| `kabardino-balkarskaia-respublika` | Кабардино-Балкарская Республика |
| `kaliningradskaia-oblast` | Калининградская область |
| `kaluzhskaia-oblast` | Калужская область |
| `kamchatskii-krai` | Камчатский край |
| `karachaevo-cherkesskaia-respublika` | Карачаево-Черкесская Республика |
| `kemerovskaia-oblast-kuzbass` | Кемеровская область - Кузбасс |
| `khabarovskii-krai` | Хабаровский край |
| `khanty-mansiiskii-avtonomnyi-okrug-iugra` | Ханты-Мансийский автономный округ - Югра |
| `kirovskaia-oblast` | Кировская область |
| `kostromskaia-oblast` | Костромская область |
| `krasnodarskii-krai` | Краснодарский край |
| `krasnoiarskii-krai` | Красноярский край |
| `kurganskaia-oblast` | Курганская область |
| `kurskaia-oblast` | Курская область |
| `leningradskaia-oblast` | Ленинградская область |
| `lipetskaia-oblast` | Липецкая область |
| `magadanskaia-oblast` | Магаданская область |
| `moskovskaia-oblast` | Московская область |
| `moskva` | Москва |
| `murmanskaia-oblast` | Мурманская область |
| `nenetskii-avtonomnyi-okrug` | Ненецкий автономный округ |
| `nizhegorodskaia-oblast` | Нижегородская область |
| `novgorodskaia-oblast` | Новгородская область |
| `novosibirskaia-oblast` | Новосибирская область |
| `omskaia-oblast` | Омская область |
| `orenburgskaia-oblast` | Оренбургская область |
| `orlovskaia-oblast` | Орловская область |
| `penzenskaia-oblast` | Пензенская область |
| `permskii-krai` | Пермский край |
| `primorskii-krai` | Приморский край |
| `pskovskaia-oblast` | Псковская область |
| `respublika-adygeia-adygeia` | Республика Адыгея |
| `respublika-altai` | Республика Алтай |
| `respublika-bashkortostan` | Республика Башкортостан |
| `respublika-buriatiia` | Республика Бурятия |
| `respublika-dagestan` | Республика Дагестан |
| `respublika-ingushetiia` | Республика Ингушетия |
| `respublika-kalmykiia` | Республика Калмыкия |
| `respublika-kareliia` | Республика Карелия |
| `respublika-khakasiia` | Республика Хакасия |
| `respublika-komi` | Республика Коми |
| `respublika-krym` | Республика Крым |
| `respublika-marii-el` | Республика Марий Эл |
| `respublika-mordoviia` | Республика Мордовия |
| `respublika-sakha-iakutiia` | Республика Саха (Якутия) |
| `respublika-severnaia-osetiia-alaniia` | Республика Северная Осетия-Алания |
| `respublika-tatarstan-tatarstan` | Республика Татарстан |
| `respublika-tyva` | Республика Тыва |
| `riazanskaia-oblast` | Рязанская область |
| `rostovskaia-oblast` | Ростовская область |
| `sakhalinskaia-oblast` | Сахалинская область |
| `samarskaia-oblast` | Самарская область |
| `sankt-peterburg` | Санкт-Петербург |
| `saratovskaia-oblast` | Саратовская область |
| `sevastopol` | Севастополь |
| `smolenskaia-oblast` | Смоленская область |
| `stavropolskii-krai` | Ставропольский край |
| `sverdlovskaia-oblast` | Свердловская область |
| `tambovskaia-oblast` | Тамбовская область |
| `tiumenskaia-oblast` | Тюменская область |
| `tomskaia-oblast` | Томская область |
| `tulskaia-oblast` | Тульская область |
| `tverskaia-oblast` | Тверская область |
| `udmurtskaia-respublika` | Удмуртская Республика |
| `ulianovskaia-oblast` | Ульяновская область |
| `vladimirskaia-oblast` | Владимирская область |
| `volgogradskaia-oblast` | Волгоградская область |
| `vologodskaia-oblast` | Вологодская область |
| `voronezhskaia-oblast` | Воронежская область |
| `zabaikalskii-krai` | Забайкальский край |

### 3.6 crash_scheme (68)

| код | status | note |
|---|---|---|
| `070` | `unresolved` | код схемы, имя не установлено |
| `500` | `unresolved` |  |
| `610` | `unresolved` |  |
| `740` | `unresolved` |  |
| `820` | `unresolved` |  |
| `200` | `unresolved` |  |
| `300` | `unresolved` |  |
| `600` | `unresolved` |  |
| `430` | `unresolved` |  |
| `880` | `unresolved` |  |
| `910` | `unresolved` |  |
| `210` | `unresolved` |  |
| `930` | `unresolved` |  |
| `940` | `unresolved` |  |
| `840` | `unresolved` |  |
| `830` | `unresolved` |  |
| `960` | `unresolved` |  |
| `140` | `unresolved` |  |
| `950` | `unresolved` |  |
| `710` | `unresolved` |  |
| `720` | `unresolved` |  |
| `130` | `unresolved` |  |
| `220` | `unresolved` |  |
| `800` | `unresolved` |  |
| `700` | `unresolved` |  |
| `030` | `unresolved` |  |
| `060` | `unresolved` |  |
| `730` | `unresolved` |  |
| `040` | `unresolved` |  |
| `330` | `unresolved` |  |
| `420` | `unresolved` |  |
| `850` | `unresolved` |  |
| `050` | `unresolved` |  |
| `400` | `unresolved` |  |
| `810` | `unresolved` |  |
| `090` | `unresolved` | код оканчивается на 90, но не в upstream-excluded — считается схемой |
| `120` | `unresolved` |  |
| `010` | `unresolved` |  |
| `900` | `unresolved` |  |
| `750` | `unresolved` |  |
| `920` | `unresolved` |  |
| `860` | `unresolved` |  |
| `110` | `unresolved` |  |
| `760` | `unresolved` |  |
| `870` | `unresolved` |  |
| `780` | `unresolved` |  |
| `770` | `unresolved` |  |
| `190` | `unresolved` | код оканчивается на 90, но не в upstream-excluded — считается схемой |
| `410` | `unresolved` |  |
| `100` | `unresolved` |  |
| `020` | `unresolved` |  |
| `230` | `unresolved` |  |
| `630` | `unresolved` |  |
| `980` | `unresolved` |  |
| `440` | `unresolved` |  |
| `340` | `unresolved` |  |
| `620` | `unresolved` |  |
| `310` | `unresolved` |  |
| `970` | `unresolved` |  |
| `320` | `unresolved` |  |
| `990` | `no_scheme` | upstream возвращает None (s_dtp в списке исключений); причина/смысл не задокументирован |
| `890` | `no_scheme` | upstream возвращает None (s_dtp в списке исключений); причина/смысл не задокументирован |
| `490` | `no_scheme` | upstream возвращает None (s_dtp в списке исключений); причина/смысл не задокументирован |
| `290` | `no_scheme` | upstream возвращает None (s_dtp в списке исключений); причина/смысл не задокументирован |
| `590` | `no_scheme` | upstream возвращает None (s_dtp в списке исключений); причина/смысл не задокументирован |
| `690` | `no_scheme` | upstream возвращает None (s_dtp в списке исключений); причина/смысл не задокументирован |
| `390` | `no_scheme` | upstream возвращает None (s_dtp в списке исключений); причина/смысл не задокументирован |
| `790` | `no_scheme` | upstream возвращает None (s_dtp в списке исключений); причина/смысл не задокументирован |

### 3.7 brand (аудит)

| RAW brand | → bucket | status |
|---|---|---|
| `Прочие марки ТС` | `technical_bucket_other` | `aggregate` |
| `Прочие марки мотоциклов` | `technical_bucket_moto` | `aggregate` |
| `Прочие марки автобусов` | `technical_bucket_bus` | `aggregate` |
| `Прочие марки легковых ТС` | `technical_bucket_car` | `aggregate` |
| `Прочие марки грузовых ТС` | `technical_bucket_truck` | `aggregate` |
| `Прочие марки строительной техники` | `technical_bucket_special` | `aggregate` |
| `Прочие марки седельных тягачей` | `technical_bucket_truck` | `aggregate` |
| `Прочие марки легких коммерческих ТС` | `technical_bucket_truck` | `aggregate` |
| `Прочие марки автокранов` | `technical_bucket_special` | `aggregate` |

---
## 4. model — QUARANTINED / RED

Поле model не используется ни в одном контракте. Baseline показывает системную несогласованность пар brand/model. Причина upstream не установлена → «починить» model вне scope Phase 1A.

---
## 5. Schema Drift Guard

unknown-множества пусты (observed ⊆ expected):

| Уровень | expected | observed | unknown |
|---|---|---|---|
| top-level | address, category, datetime, dead_count, gibdd_number, id, injured_count, light, nearby, parent_region, participant_categories, participants, participants_count, point, region, road_conditions, scheme, severity, tags, vehicles, weather | address, category, datetime, dead_count, gibdd_number, id, injured_count, light, nearby, parent_region, participant_categories, participants, participants_count, point, region, road_conditions, scheme, severity, tags, vehicles, weather | 0 |
| vehicle | brand, category, color, model, participants, year | brand, category, color, model, participants, year | 0 |
| participant | gender, health_status, id, role, violations, years_of_driving_experience | gender, health_status, id, role, violations, years_of_driving_experience | 0 |

> Если источник добавит новое поле, оно попадёт в unknown_* — аудит покажет warning.

---

## 6. Открытые пункты → Phase 1B (не входят в v1)

1. **`missing_expected = expected - observed`.** В v1 считаем только `unknown_* = observed - expected` (пусты). Добавить симметричный счётчик «ожидаемое, но не наблюдается» — важный drift-сигнал (источник перестал отдавать поле). В v1 это не критично (observed = expected для всех трёх уровней), поэтому зафиксировано первым пунктом Phase 1B.
2. **Стратегия хранения semantic-атрибутов** — какие поля на уровень точки (`PointRow`), какие агрегировать отдельно, какие не отдавать frontend вообще.
3. **Версионированный контракт данных** (`semantic_contract_version` на уровне generated datasets), не раздувая snapshot.
