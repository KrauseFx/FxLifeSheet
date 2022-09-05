# FxLifeSheet

[![Twitter: @KrauseFx](https://img.shields.io/badge/contact-@KrauseFx-blue.svg?style=flat)](https://twitter.com/KrauseFx)

---

### See the outcome on [howisFelix.today](https://howisFelix.today/)

<img src="https://raw.githubusercontent.com/KrauseFx/howisFelix.today/master/screenshots/Desktop-1.png" />

<h3 align=center>See the resulting work on <a href="https://howisFelix.today/">howisFelix.today</a>
<p />
 
  
<table>
  <tr>
    <td>
      <img src="https://raw.githubusercontent.com/KrauseFx/howisFelix.today/master/screenshots/iPhone-1.png" />
    </td>
    <td>
      <img src="https://raw.githubusercontent.com/KrauseFx/howisFelix.today/master/screenshots/iPhone-2.png" />
    </td>
    <td>
      <img src="https://raw.githubusercontent.com/KrauseFx/howisFelix.today/master/screenshots/iPhone-3.png" />
    </td>
  </tr>
</table>
 
---

<img src="https://raw.githubusercontent.com/KrauseFx/howisFelix.today/master/screenshots/Overview-Portrait-1.png" />

---

## Goals

**To answer questions about my life, like**

- How does living in different cities affect other factors like fitness, productivity and happiness?
- How does sleep affect my day, my fitness level, and happiness?
- How does the weather, and the different seasons affect my life?
- Are there any trends over the last few years?
- How does computer time, work and hours in meetings affect my personal life?

**Key decisions for this project:**

- Use a single database, owned and hosted by me, with all the data I've collected over the years
- Be able to [easily add and remove questions](https://github.com/KrauseFx/FxLifeSheet/blob/master/lifesheet.json) on the fly, as I learn what's beneficial to track
- Full control of how the data is visualized
- Works well for frequent flyers with mixed time zones
- 100% fully open source, MIT licensed and self-hosted

---

### This repo contains

- The [Telegram bot](https://github.com/KrauseFx/FxLifeSheet/blob/master/worker.ts) for entering data manually
- The [data visualization](https://github.com/KrauseFx/FxLifeSheet/tree/master/visual_playground), check out the results on [howisFelix.today](https://howisFelix.today)
- The [database info](https://github.com/KrauseFx/FxLifeSheet/blob/master/db/create_tables.sql)

---

### Questions to answer

There are many questions that can be answered using this data, here are some main ones I want to look into over the next few months

#### Mood/Happines related:

- How does the city I'm in influence my level of happiness?
- How does the weather/climate influence my mood
- How does travel affect my mood?
- How do certain macro nutrition goals affect my mood?
- What amount of hours of sleep have the best influence on mood?

#### Fitness related

- How do certain macro goals influence my lean body mass and fat levels?
- How does my daily kcal intake affect my social life?
- How does alcohol affect my training and fitness progress?
- Do more daily steps influence
  - my mood
  - the amount of audio books I'm reading
  - feeling connected with family & friends as often calling them
- What are the areas in life that suffer while cutting (kcal deficit):
  - mood
  - stress
  - productivity
  - energy

#### Travel

- What are the areas in life that suffer when I travel? Investigate:
  - fitness progress
  - productivity
  - stress
  - health
  - sleep
  - feeling connected with friends

#### Productivity

- How many hours did I spend on my phone and laptop over the months?
- Do I stick to my yearly book goals and how do other factors influence how much I'm reading?
- Am I more productive when I set the goals for the day the night before?

## Implementation

**Assumptions**

- The user is in random time zones at random times and switches often, therefore the bot can't know about your daily schedule. This puts a lot of focus on averages, as it doesn't matter if a value was entered at 11pm that day, or 8am the next one, the numbers will even out, as only daily, weekly and monthly averages are considered when rendering graphs.

This repo contains the Telegram bot that is responsible for collecting the data.

There are 2 ways to input data: by the user telling the bot to ask for all the values, and by a regular interval of the bot asking you (similar to the deprecated [mood bot](https://github.com/krausefx/mood))

### Configuration

[`lifesheet.json`](./lifesheet.json)

Available values for `schedule`:

- `eightTimesADay`
- `daily`
- `weekly`
- `manual`


### User initiates data inputs 

#### Mood

Using `fourTimesADay`, this will replace the mood bot

- How are you feeling today?

#### Morning

`/awake`

This will trigger the morning questions, like:

- Sleep duration
- Sleep quality
- Body weight

#### Evening

`/asleep`

This will trigger the end-of-day questions like

- Fitness related:
  - Alcohol intake
  - Macro adherence
  - Hunger issues?
  - Fatigu/Lethargy?
  - Feel stressed?
  - Caffeine intake?
  - How healthy do you feel today?
  - Number of steps
- Productivity related
  - Did I solve actual programming/technical problems?
- Social
  - Felt like enough time by myself?
  - Felt like enough in control of my own time and schedule?
  - Felt like enough socializing?
  - Felt like enough going out, bars, restaurants, dancing etc.
- Personal growth
  - Learned new skills or things?
  - Went out of my comfort zone?
  - Number of minutes of Audible
- Other
  - Meditated
  - Note: what was the main thing I did today?
  - Boolean: Did I set goals for the next day?
  - Do you feel excited about what's ahead in the future?

#### Week

`/week`

This will trigger questions that take longer to reply, so they're only done weekly

- Fitness related
  - Current macros
    - g of Carbs
    - g of Protein
    - g of Fat
  - Body measurements
  - Overall training adherence
  - Note: Comments on fitness
- Productivity
  - Overall happiness with life progress of the week, do I go into the right direction?
  - Number of open Trello tasks (from [howisFelix.today](https://howisFelix.today))
  - Number of emails in Inbox less than 5?
  - Average daily hours on computer
  - Average daily iOS screen time (minus MyFitnessPal and Strong app)
- Social
  - Felt like spent enough time with family?
  - Had deep conversations with close friends?
- Other
  - Did I travel, this includes every city more than 1h away, this is relevant for both fitness and productivity
  - Note of all locations I was at (cities)
  - Got out of my comfort zone & experienced/tried new things?
  - Do you feel like having to travel somewhere?
  - Do you feel like you're missing out on things?
  - Played computer games by myself
  - Played computer games with friends or family?

## Telegram

### Insert for available commands

```
skip - Skip a question that was asked
report - Generate one page report
track - Track a specific value only
mood - Track your mood
awake - First thing in the morning
asleep - Right before going to sleep
week - Once per week metrics
skip_all - Remove all queued questions
```

## Development

### Running locally

```
npm run dev
```


### Debugging

After using `npm run dev`, open [chrome://inspect](chrome://inspect) to use the Chrome Dev Tools

### Setup

### Environment variables

`.keys` file or however you manage your secret env variables:

```
export TELEGRAM_BOT_TOKEN=""
export TELEGRAM_USER_ID=""
export TELEGRAM_CHAT_ID=""

export DATABASE_URL=""

export LIFESHEET_JSON_URL=""
```

### Scheduler

Not using Heroku any more, in railway.app, just add this as its own service

```
npm run scheduler
```

### Postgres

Create a new Postgres database, and run the SQL queries defined in [db/create_tables.sql](db/create_tables.sql)

<img src="screenshots/Database1.png" />
<img src="screenshots/Database2.png" />

### Data Visualization

To analyze the data, check out the `visual_playground` subfolder https://github.com/KrauseFx/FxLifeSheet/tree/master/visual_playground

## Origins

The original implementation abused Google Sheets as a database, and I used Google Data Studio to visualize the data. Both implementations ended up not working pretty quickly.

<img src="screenshots/Dashboard1.png" />
<img src="screenshots/Dashboard2.png" />

