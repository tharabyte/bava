package app

import "github.com/tharabyte/bava/internal/agent"

// Events the agent plug sends the page.
const (
	// AgentStatusEvent carries an agent.Status when an agent connects or goes.
	AgentStatusEvent = "agent:status"
	// AgentStepEvent carries an agent.Step as each tool call starts and ends.
	AgentStepEvent = "agent:step"
	// AgentClaimsEvent carries the pages the AI holds, after each change.
	AgentClaimsEvent = "agent:claims"
)

// AgentServiceOptions wire the service to the plug's parts, made in main.
type AgentServiceOptions struct {
	// Asker matches the page's answers to the tools' questions.
	Asker *agent.Asker
	// Plug is the server agents connect to.
	Plug *agent.Plug
	// Claims are the pages the AI holds.
	Claims *agent.Claims
}

// AgentService is the page's side of the agent plug.
type AgentService struct {
	asker  *agent.Asker
	plug   *agent.Plug
	claims *agent.Claims
}

// NewAgentService constructs the service registered with the application.
func NewAgentService(opts AgentServiceOptions) *AgentService {
	claims := opts.Claims
	if claims == nil {
		claims = agent.NewClaims(nil)
	}
	return &AgentService{asker: opts.Asker, plug: opts.Plug, claims: claims}
}

// StopClaim is the user's Stop on a page the AI holds: the changes made
// stay, and the page refuses any more from the AI this round.
func (s *AgentService) StopClaim(page string) {
	s.claims.Stop(page)
}

// Claims is the pages the AI holds now.
func (s *AgentService) Claims() []string {
	return s.claims.Held()
}

// Answer is the page's answer to the question with that id (agent:ask):
// result as JSON, or failure saying why it could not answer. A late answer
// is dropped.
func (s *AgentService) Answer(id, result, failure string) {
	s.asker.Answer(id, result, failure)
}

// Configure follows AI settings: agents allowed or not, on which port,
// and whether the AI may edit pages.
func (s *AgentService) Configure(allowAgents bool, port int, allowEdits bool) agent.Status {
	// Turning agents or edits off gives every page back to the user.
	if !allowAgents || !allowEdits {
		s.claims.ReleaseAll()
	}
	return s.plug.Configure(allowAgents, port, allowEdits)
}

// NewCode makes a fresh connection code; agents using the old one must
// connect again.
func (s *AgentService) NewCode() agent.Status {
	return s.plug.NewCode()
}

// Status is the plug now.
func (s *AgentService) Status() agent.Status {
	return s.plug.Status()
}
