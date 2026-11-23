import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { policyContent, policyPaths, type Policy } from './policies';
import './referencePages.css';

export function PolicyLinks({ active }: { active?: Policy }) {
  return <nav className="policy-links" aria-label="Legal policies">
    {(Object.keys(policyPaths) as Policy[]).map((policy) => <a key={policy} href={policyPaths[policy].href}
      aria-current={active === policy ? 'page' : undefined}>{policyPaths[policy].title}</a>)}
  </nav>;
}

export function SiteFooter({ policy }: { policy?: Policy }) {
  return <footer className="site-footer">
    <span><ShieldCheck size={16} aria-hidden="true"/> ContractGuard AI</span>
    <PolicyLinks active={policy}/>
    <span>Information only · Not legal advice</span>
  </footer>;
}

export function PolicyPage({ policy }: { policy: Policy }) {
  const { intro, sections } = policyContent[policy];
  return <article className="policy-page">
    <header className="policy-hero">
      <div>
        <a href="#contract-analyzer"><ArrowLeft size={16} aria-hidden="true"/> Contract analyzer</a>
        <h1 tabIndex={-1}>{policyPaths[policy].title}</h1>
        <p>{intro}</p>
        <p className="policy-date">Draft · Updated <time dateTime="2026-11-23">23 November 2026</time></p>
      </div>
    </header>
    <div className="policy-body">
      {sections.map((section) => <section key={section.heading}>
        <h2>{section.heading}</h2>
        {section.text.map((paragraph) => <p key={paragraph} className={paragraph.startsWith('OWNER ACTION REQUIRED') ? 'policy-owner' : undefined}>
          {paragraph}
        </p>)}
        {section.references && <ul>{section.references.map(({ label, href }) => <li key={href}><a href={href}>{label}</a></li>)}</ul>}
      </section>)}
    </div>
  </article>;
}
