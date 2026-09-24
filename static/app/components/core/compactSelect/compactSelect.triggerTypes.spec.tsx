import {expectTypeOf} from 'expect-type';
import {CompactSelect, type SelectOption} from './';
import {DropdownButton} from '@sentry/scraps/dropdownMenu';
import {OverlayTrigger} from '@sentry/scraps/overlayTrigger';

describe('CompactSelect', () => {
 describe('types', () => {
it('should only allow SelectTrigger as trigger', () => {
      const value: 'opt_one' | 'opt_two' = 'opt_one';
      void (
        <CompactSelect
          value={value}
          onChange={() => {}}
          trigger={props => {
            // @ts-expect-error should only allow SelectTrigger components
            return <DropdownButton {...props}>Trigger</DropdownButton>;
          }}
          options={[
            {value: 'opt_one', label: 'Option One'},
            {value: 'opt_two', label: 'Option Two'},
          ]}
        />
      );

      void (
        <CompactSelect
          value={value}
          onChange={() => {}}
          trigger={props => {
            // no type error here
            return <OverlayTrigger.Button {...props}>Trigger</OverlayTrigger.Button>;
          }}
          options={[
            {value: 'opt_one', label: 'Option One'},
            {value: 'opt_two', label: 'Option Two'},
          ]}
        />
      );
    });

it('should not allow undefined or null as children of SelectTrigger', () => {
      void (
        <CompactSelect
          value=""
          onChange={() => {}}
          trigger={props => {
            // @ts-expect-error TS2322: Type null is not assignable to type NonNullable<ReactNode>
            return <OverlayTrigger.Button {...props}>{null}</OverlayTrigger.Button>;
          }}
          options={[]}
        />
      );
      void (
        <CompactSelect
          value=""
          onChange={() => {}}
          trigger={props => {
            return (
              // @ts-expect-error TS2322: Type undefined is not assignable to type NonNullable<ReactNode>
              <OverlayTrigger.Button {...props}>{undefined}</OverlayTrigger.Button>
            );
          }}
          options={[]}
        />
      );
    });
 });
});
