# bioinformaticsalgorithms.org

The website for *Bioinformatics Algorithms: An Active Learning Approach* by Phillip Compeau and Pavel Pevzner. Jekyll, built by GitHub Pages.

## What lives where

- `_data/lessons.yml`: every free lesson, with its book title and its search title. Edit search titles here.
- `_lessons/chN/`: the lesson pages (chapters 1 to 5), one file per lesson. Generated from the old Wix embeds by `scripts/import_lessons.py`; edit the files directly from now on.
- `_data/chapters.yml`: all eleven chapters (question, topic, lecture playlist, cover).
- `_data/faq/`: the learner FAQ, one file per chapter. Generated from the Wix FAQ app export by `scripts/import_faq.py`.
- `_config.yml`: prices, checkout link, Google Analytics, and the preview settings.

## Local preview

```
bundle install
bundle exec jekyll serve
```

## Going live (cutover checklist)

1. In `_config.yml`: `url: "https://www.bioinformaticsalgorithms.org"`, `baseurl: ""`, `noindex: false`, and `checkout_url` pointing at the new checkout.
2. Add a `CNAME` file containing `www.bioinformaticsalgorithms.org`.
3. DNS (moving off Wix nameservers): keep the Namecheap email forwarding MX records and the `google-site-verification` TXT record.
