import type { WebSkillGenerator } from 'web-skill';
import { buildWebSkillLinkTags } from 'web-skill/dev';

export function publishWebSkills(generator: WebSkillGenerator) {
  const skills = generator.getSkills();
  generator.install(window);

  const links = buildWebSkillLinkTags(skills);
  const elements = links.map((link, index) => {
    const element = document.createElement('link');
    element.rel = 'web-skill';
    element.type = link.type;
    element.title = link.title;
    element.href = resolveSkillHref(link.href);
    element.dataset.webSkillKey = skills[index]?.key ?? `web-skill-${index}`;
    document.head.appendChild(element);
    return element;
  });

  return () => {
    elements.forEach((element) => element.remove());

    const webSkillsRegistry = Reflect.get(window, '_web_skills') as
      | Record<string, unknown>
      | undefined;

    for (const skill of skills) {
      if (webSkillsRegistry?.[skill.key]) {
        delete webSkillsRegistry[skill.key];
      }
    }

    if (webSkillsRegistry && Object.keys(webSkillsRegistry).length === 0) {
      Reflect.deleteProperty(window, '_web_skills');
    }
  };
}

function resolveSkillHref(href: string) {
  const relativeHref = href.replace(/^\/+/, '');
  return new URL(relativeHref, document.baseURI).toString();
}
